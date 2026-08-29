"""MediStock Pro — backend API regression suite."""
import uuid
from datetime import date, timedelta

import pytest
from conftest import API


def _sale_ready_batch(owner):
    """Return (product, batch) with available stock and non-expired batch."""
    r = owner.get(f"{API}/inventory", params={"limit": 50}, timeout=60)
    assert r.status_code == 200
    today = date.today().isoformat()
    for p in r.json()["items"]:
        for b in sorted(p.get("batches", []), key=lambda x: x.get("expiry_date", "")):
            if b.get("available_qty", 0) >= 5 and (b.get("expiry_date") or "")[:10] > today:
                return p, b
    pytest.fail("No sellable batch found in seeded inventory")


# --------------------------- Auth ---------------------------
class TestAuth:
    def test_root(self, anon):
        r = anon.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_login_success(self, anon, test_credentials):
        r = anon.post(f"{API}/auth/login", json=test_credentials, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["user"]["email"] == test_credentials["email"].lower()
        assert d["user"]["role"] == "owner"
        assert "password_hash" not in d["user"]
        assert "_id" not in d["user"]

    def test_login_bad_password(self, anon, test_credentials):
        r = anon.post(f"{API}/auth/login",
                      json={"email": test_credentials["email"], "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, owner):
        r = owner.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "owner"
        assert d["business"] and d["business"].get("name")
        assert d["permissions"] == ["*"]

    def test_unauthenticated_blocked(self, anon):
        r = anon.get(f"{API}/dashboard", timeout=30)
        assert r.status_code == 401

    def test_invalid_token(self, anon):
        r = anon.get(f"{API}/dashboard", headers={"Authorization": "Bearer garbage"}, timeout=30)
        assert r.status_code == 401

    def test_bcrypt_hash_format(self):
        import asyncio
        import os
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mongo = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
        dbname = os.environ.get("DB_NAME") or env.get("DB_NAME")

        async def go():
            c = AsyncIOMotorClient(mongo)
            u = await c[dbname].users.find_one({"role": "owner"})
            c.close()
            return u
        u = asyncio.get_event_loop().run_until_complete(go()) if False else __import__("asyncio").run(go())
        assert u is not None
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]


# --------------------------- Dashboard / Reports ---------------------------
class TestDashboard:
    def test_dashboard_kpis(self, owner):
        r = owner.get(f"{API}/dashboard", timeout=60)
        assert r.status_code == 200
        d = r.json()
        for k in ("today_sales", "today_profit", "inventory_value", "outstanding_credit",
                  "supplier_payables", "low_stock", "expiring", "expired", "invoice_count"):
            assert k in d, f"missing {k}"
        assert d["inventory_value"] > 0

    def test_charts(self, owner):
        r = owner.get(f"{API}/dashboard/charts", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert len(d["daily"]) == 7
        assert isinstance(d["top_products"], list)
        assert isinstance(d["payment_split"], list)

    def test_reports(self, owner):
        start = (date.today() - timedelta(days=60)).isoformat()
        end = date.today().isoformat()
        r = owner.get(f"{API}/reports/sales", params={"start": start, "end": end}, timeout=60)
        assert r.status_code == 200
        assert r.json()["count"] >= 0
        r = owner.get(f"{API}/reports/gst", params={"start": start, "end": end}, timeout=60)
        assert r.status_code == 200
        assert "hsn_summary" in r.json()
        r = owner.get(f"{API}/reports/stock-valuation", timeout=60)
        assert r.status_code == 200
        assert r.json()["total_cost"] > 0

    def test_export_allowed_and_blocked(self, owner):
        r = owner.get(f"{API}/export/products", timeout=60)
        assert r.status_code == 200
        assert r.json()["count"] > 0
        r = owner.get(f"{API}/export/users", timeout=30)
        assert r.status_code == 400

    def test_audit_logs(self, owner):
        r = owner.get(f"{API}/audit-logs", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------------------- Products / Inventory ---------------------------
class TestProducts:
    created = []

    def test_list_products(self, owner):
        r = owner.get(f"{API}/products", params={"limit": 10}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0 and len(d["items"]) > 0
        assert "stock" in d["items"][0]

    def test_search_products(self, owner):
        r = owner.get(f"{API}/products", params={"search": "para"}, timeout=60)
        assert r.status_code == 200
        assert r.json()["total"] >= 0

    def test_create_update_and_persist(self, owner):
        payload = {"name": "TEST_Product_" + uuid.uuid4().hex[:6], "brand": "TESTBRAND",
                   "gst_rate": 12, "mrp": 100, "purchase_rate": 60, "selling_rate": 95,
                   "min_stock": 5, "hsn": "3004", "unit": "pcs"}
        r = owner.post(f"{API}/products", json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        p = r.json()
        assert p["name"] == payload["name"] and "_id" not in p
        TestProducts.created.append(p["id"])

        g = owner.get(f"{API}/products/{p['id']}", timeout=30)
        assert g.status_code == 200
        assert g.json()["name"] == payload["name"]
        assert g.json()["stock"] == 0

        u = owner.put(f"{API}/products/{p['id']}", json={"selling_rate": 111}, timeout=30)
        assert u.status_code == 200
        assert owner.get(f"{API}/products/{p['id']}", timeout=30).json()["selling_rate"] == 111

    def test_product_404(self, owner):
        assert owner.get(f"{API}/products/nope-{uuid.uuid4()}", timeout=30).status_code == 404

    def test_categories(self, owner):
        r = owner.get(f"{API}/categories", timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)

    @classmethod
    def teardown_class(cls):
        pass


class TestInventory:
    def test_inventory_batches(self, owner):
        r = owner.get(f"{API}/inventory", params={"limit": 20}, timeout=60)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i.get("batches") for i in items)

    def test_adjust_stock_and_persist(self, owner):
        # dedicated batch (isolated from concurrent sale tests)
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        prod = owner.get(f"{API}/products", params={"limit": 1}, timeout=60).json()["items"][0]
        exp = (date.today() + timedelta(days=600)).isoformat()
        pur = owner.post(f"{API}/purchases", json={
            "supplier_id": sup["id"],
            "items": [{"product_id": prod["id"], "batch_number": "TESTADJ", "expiry_date": exp,
                       "qty": 20, "mrp": 100, "purchase_rate": 60, "gst_rate": 12}],
            "paid_amount": 0}, timeout=60)
        assert pur.status_code == 200, pur.text[:300]
        det = owner.get(f"{API}/purchases/{pur.json()['id']}", timeout=30).json()
        batch_id = det["items"][0]["batch_id"]
        r = owner.post(f"{API}/inventory/adjust",
                       json={"batch_id": batch_id, "qty": -3, "reason": "TEST_adjust"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["available_qty"] == 17
        after = owner.get(f"{API}/products/{prod['id']}", timeout=30).json()
        nb = next(x for x in after["batches"] if x["id"] == batch_id)
        assert nb["available_qty"] == 17
        # remove the test batch stock
        owner.post(f"{API}/inventory/adjust",
                   json={"batch_id": batch_id, "qty": -17, "reason": "TEST_cleanup"}, timeout=30)

    def test_adjust_negative_beyond_stock(self, owner):
        p, b = _sale_ready_batch(owner)
        r = owner.post(f"{API}/inventory/adjust",
                       json={"batch_id": b["id"], "qty": -999999, "reason": "TEST"}, timeout=30)
        assert r.status_code == 400

    def test_adjust_batch_404(self, owner):
        r = owner.post(f"{API}/inventory/adjust",
                       json={"batch_id": "nope", "qty": -1, "reason": "TEST"}, timeout=30)
        assert r.status_code == 404

    def test_reorder(self, owner):
        r = owner.get(f"{API}/reorder", timeout=60)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_expiry_buckets(self, owner):
        r = owner.get(f"{API}/expiry", timeout=60)
        assert r.status_code == 200
        d = r.json()
        for k in ("expired", "d30", "d60", "d90", "d180"):
            assert k in d
        for rec in d["expired"]:
            assert rec["days_left"] < 0

    def test_stock_movements(self, owner):
        r = owner.get(f"{API}/stock-movements", timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)


# --------------------------- Sales / POS ---------------------------
class TestSales:
    def test_cash_sale_deducts_stock_and_gst(self, owner):
        p, b = _sale_ready_batch(owner)
        before = b["available_qty"]
        payload = {"items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
                   "payment_method": "cash", "paid_amount": 0,
                   "idempotency_key": "TEST_" + uuid.uuid4().hex}
        # pay full after computing? send paid later; use grand from response
        r = owner.post(f"{API}/sales", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:400]
        s = r.json()
        assert s["invoice_no"].startswith("INV-")
        assert s["grand_total"] > 0
        assert abs(s["cgst"] + s["sgst"] - s["total_tax"]) < 0.05
        assert "_id" not in s
        # stock deducted
        after = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        nb = next(x for x in after["batches"] if x["id"] == b["id"])
        assert nb["available_qty"] == before - 2, "Stock not deducted correctly"
        # detail endpoint
        det = owner.get(f"{API}/sales/{s['id']}", timeout=30)
        assert det.status_code == 200
        assert len(det.json()["items"]) == 1
        assert det.json()["business"]["name"]

    def test_idempotency_no_double_deduction(self, owner):
        p, b = _sale_ready_batch(owner)
        before = b["available_qty"]
        key = "TEST_IDEM_" + uuid.uuid4().hex
        payload = {"items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 1}],
                   "payment_method": "cash", "paid_amount": 0, "idempotency_key": key}
        r1 = owner.post(f"{API}/sales", json=payload, timeout=60)
        r2 = owner.post(f"{API}/sales", json=payload, timeout=60)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["invoice_no"] == r2.json()["invoice_no"]
        after = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        nb = next(x for x in after["batches"] if x["id"] == b["id"])
        assert nb["available_qty"] == before - 1, "Duplicate submission deducted stock twice"

    def test_expired_batch_cannot_be_sold(self, owner):
        exp = owner.get(f"{API}/expiry", timeout=60).json()["expired"]
        if not exp:
            pytest.skip("no expired batch seeded")
        b = exp[0]
        r = owner.post(f"{API}/sales", json={
            "items": [{"product_id": b["product_id"], "batch_id": b["id"], "qty": 1}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60)
        assert r.status_code == 400
        assert "expired" in r.json()["detail"].lower()

    def test_insufficient_stock_rejected(self, owner):
        p, b = _sale_ready_batch(owner)
        r = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 999999}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60)
        assert r.status_code == 400
        assert "insufficient" in r.json()["detail"].lower()

    def test_empty_bill_rejected(self, owner):
        r = owner.post(f"{API}/sales", json={"items": [], "payment_method": "cash"}, timeout=30)
        assert r.status_code == 400

    def test_credit_sale_updates_customer_ledger(self, owner):
        cust = owner.post(f"{API}/customers", json={
            "name": "TEST_Credit_" + uuid.uuid4().hex[:5], "phone": "9000000001"}, timeout=30).json()
        p, b = _sale_ready_batch(owner)
        r = owner.post(f"{API}/sales", json={
            "customer_id": cust["id"],
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 1}],
            "payment_method": "credit", "paid_amount": 0}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        sale = r.json()
        assert sale["balance"] == sale["grand_total"]
        led = owner.get(f"{API}/customers/{cust['id']}/ledger", timeout=30)
        assert led.status_code == 200
        d = led.json()
        assert abs(d["customer"]["balance"] - sale["grand_total"]) < 0.05
        assert any(e["reference"] == sale["invoice_no"] and e["debit"] > 0 for e in d["entries"])

        # payment reduces outstanding
        pay = owner.post(f"{API}/payments", json={"party_type": "customer",
                         "party_id": cust["id"], "amount": sale["grand_total"],
                         "method": "cash"}, timeout=30)
        assert pay.status_code == 200
        assert abs(pay.json()["new_balance"]) < 0.05
        led2 = owner.get(f"{API}/customers/{cust['id']}/ledger", timeout=30).json()
        assert abs(led2["customer"]["balance"]) < 0.05

    def test_sales_return_restocks(self, owner):
        p, b = _sale_ready_batch(owner)
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        det = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()
        item = det["items"][0]
        cur = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        qty_before = next(x for x in cur["batches"] if x["id"] == b["id"])["available_qty"]
        r = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                       "items": [{"sale_item_id": item["id"], "qty": 1}],
                       "reason": "TEST_return", "restock": True}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        ret = r.json()
        assert ret["return_no"].startswith("SR-") and ret["refund_amount"] > 0
        after = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        assert next(x for x in after["batches"] if x["id"] == b["id"])["available_qty"] == qty_before + 1
        lst = owner.get(f"{API}/sales-returns", timeout=30).json()
        assert any(x["return_no"] == ret["return_no"] for x in lst)

    def test_sales_return_qty_exceeds(self, owner):
        p, b = _sale_ready_batch(owner)
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 1}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        r = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                       "items": [{"sale_item_id": item["id"], "qty": 50}]}, timeout=30)
        assert r.status_code == 400

    def test_repeated_returns_cannot_exceed_sold_qty(self, owner):
        """Returning the full qty twice must not be allowed (over-restocking)."""
        p, b = _fresh_batch(owner)
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        r1 = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                        "items": [{"sale_item_id": item["id"], "qty": 2}]}, timeout=30)
        assert r1.status_code == 200
        r2 = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                        "items": [{"sale_item_id": item["id"], "qty": 2}]}, timeout=30)
        assert r2.status_code == 400, (
            "BUG: second full return of the same sale item accepted -> stock over-restocked "
            f"(refund {r2.json().get('refund_amount')})")

    def test_cancel_sale_restores_stock(self, owner):
        p, b = _sale_ready_batch(owner)
        cur = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        qb = next(x for x in cur["batches"] if x["id"] == b["id"])["available_qty"]
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 1}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        r = owner.post(f"{API}/sales/{sale['id']}/cancel", timeout=30)
        assert r.status_code == 200
        after = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        assert next(x for x in after["batches"] if x["id"] == b["id"])["available_qty"] == qb
        r2 = owner.post(f"{API}/sales/{sale['id']}/cancel", timeout=30)
        assert r2.status_code == 400

    def test_cancel_after_return_should_not_double_restock(self, owner):
        p, b = _fresh_batch(owner)
        cur = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        qb = next(x for x in cur["batches"] if x["id"] == b["id"])["available_qty"]
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        assert owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                          "items": [{"sale_item_id": item["id"], "qty": 2}]},
                          timeout=30).status_code == 200
        c = owner.post(f"{API}/sales/{sale['id']}/cancel", timeout=30)
        assert c.status_code == 400, "cancel after return should be blocked"
        after = owner.get(f"{API}/products/{p['id']}", timeout=30).json()
        qa = next(x for x in after["batches"] if x["id"] == b["id"])["available_qty"]
        assert qa == qb, f"BUG: stock inflated after return+cancel ({qb} -> {qa})"

    def test_list_sales(self, owner):
        r = owner.get(f"{API}/sales", params={"limit": 10}, timeout=60)
        assert r.status_code == 200
        assert r.json()["total"] > 0

    def test_sale_404(self, owner):
        assert owner.get(f"{API}/sales/{uuid.uuid4()}", timeout=30).status_code == 404


# --------------------------- Purchases ---------------------------
class TestPurchases:
    def test_purchase_increases_stock_and_payable(self, owner):
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        sup_bal = owner.get(f"{API}/suppliers/{sup['id']}/ledger", timeout=30).json()["supplier"]["balance"]
        prod = owner.post(f"{API}/products", json={
            "name": "TEST_PurchStock_" + uuid.uuid4().hex[:6], "gst_rate": 12,
            "mrp": 100, "purchase_rate": 60, "selling_rate": 95}, timeout=30).json()
        stock_before = 0
        exp = (date.today() + timedelta(days=400)).isoformat()
        r = owner.post(f"{API}/purchases", json={
            "supplier_id": sup["id"], "supplier_invoice_no": "TEST-INV-" + uuid.uuid4().hex[:5],
            "items": [{"product_id": prod["id"], "batch_number": "TESTB1", "expiry_date": exp,
                       "qty": 10, "free_qty": 0, "mrp": 100, "purchase_rate": 60,
                       "gst_rate": 12, "selling_price": 95}],
            "paid_amount": 0, "payment_method": "credit"}, timeout=60)
        assert r.status_code == 200, r.text[:400]
        pur = r.json()
        assert pur["purchase_no"].startswith("PUR-")
        assert pur["grand_total"] == pytest.approx(672, abs=1)
        assert pur["balance"] == pur["grand_total"]
        after = owner.get(f"{API}/products/{prod['id']}", timeout=30).json()
        assert after["stock"] == stock_before + 10, "Purchase did not increase stock"
        # supplier payable increased & ledger entry recorded for this purchase
        led = owner.get(f"{API}/suppliers/{sup['id']}/ledger", timeout=30).json()
        assert led["supplier"]["balance"] >= sup_bal + pur["grand_total"] - 1
        assert any(e["reference"] == pur["purchase_no"] and
                   abs(e["credit"] - pur["grand_total"]) < 1 for e in led["entries"])
        # appears in history
        hist = owner.get(f"{API}/purchases", params={"limit": 20}, timeout=60).json()["items"]
        assert any(x["purchase_no"] == pur["purchase_no"] for x in hist)
        det = owner.get(f"{API}/purchases/{pur['id']}", timeout=30)
        assert det.status_code == 200 and len(det.json()["items"]) == 1

    def test_purchase_bad_supplier(self, owner):
        r = owner.post(f"{API}/purchases", json={"supplier_id": "nope", "items": [
            {"product_id": "x", "batch_number": "b", "expiry_date": "2027-01-01",
             "qty": 1, "mrp": 1, "purchase_rate": 1}]}, timeout=30)
        assert r.status_code == 404

    def test_csv_import_preview_and_commit(self, owner):
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        exp = (date.today() + timedelta(days=500)).strftime("%Y-%m-%d")
        newname = "TEST_CSVProd_" + uuid.uuid4().hex[:5]
        csv_text = (
            "Product,Batch,Expiry,Qty,Free Qty,MRP,Rate,Discount,GST,HSN,Manufacturer\n"
            f"{newname},CSVB1,{exp},20,2,50,30,0,12,3004,TestMfg\n"
            f",CSVB2,{exp},5,0,10,5,0,5,3004,TestMfg\n"
        )
        r = owner.post(f"{API}/purchases/import/preview", json={"csv": csv_text}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["summary"]["total"] == 2
        assert d["summary"]["errors"] == 1
        assert d["summary"]["new_products"] >= 1
        rows = d["rows"]
        c = owner.post(f"{API}/purchases/import/commit", json={
            "supplier_id": sup["id"], "supplier_invoice_no": "TEST-CSV",
            "rows": rows}, timeout=60)
        assert c.status_code == 200, c.text[:400]
        assert c.json()["imported"] == 1
        found = owner.get(f"{API}/products", params={"search": newname}, timeout=60).json()
        assert found["total"] == 1
        assert found["items"][0]["stock"] == 22

    def test_csv_commit_requires_supplier(self, owner):
        r = owner.post(f"{API}/purchases/import/commit", json={"supplier_id": "nope", "rows": []},
                       timeout=30)
        assert r.status_code == 404

    def test_purchase_return_expired(self, owner):
        exp = owner.get(f"{API}/expiry", timeout=60).json()["expired"]
        if not exp:
            pytest.skip("no expired batch")
        b = exp[0]
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        r = owner.post(f"{API}/purchase-returns", json={"supplier_id": sup["id"],
                       "batch_id": b["id"], "qty": 1, "reason": "Expired"}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["return_no"].startswith("PR-")
        lst = owner.get(f"{API}/purchase-returns", timeout=30).json()
        assert any(x["return_no"] == r.json()["return_no"] for x in lst)

    def test_purchase_return_invalid_qty(self, owner):
        exp = owner.get(f"{API}/expiry", timeout=60).json()["expired"]
        if not exp:
            pytest.skip("no expired batch")
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        r = owner.post(f"{API}/purchase-returns", json={"supplier_id": sup["id"],
                       "batch_id": exp[0]["id"], "qty": 999999}, timeout=30)
        assert r.status_code == 400


# --------------------------- Customers / Suppliers / Udhar ---------------------------
class TestParties:
    def test_customer_crud_and_ledger(self, owner):
        name = "TEST_Cust_" + uuid.uuid4().hex[:6]
        r = owner.post(f"{API}/customers", json={"name": name, "phone": "9111111111",
                       "opening_balance": 500}, timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert c["balance"] == 500 and "_id" not in c
        led = owner.get(f"{API}/customers/{c['id']}/ledger", timeout=30).json()
        assert any(e["reference"] == "OPENING" for e in led["entries"])
        u = owner.put(f"{API}/customers/{c['id']}", json={"phone": "9222222222"}, timeout=30)
        assert u.status_code == 200 and u.json()["phone"] == "9222222222"
        pay = owner.post(f"{API}/payments", json={"party_type": "customer", "party_id": c["id"],
                         "amount": 200, "method": "cash"}, timeout=30)
        assert pay.status_code == 200 and pay.json()["new_balance"] == 300
        assert owner.get(f"{API}/customers/{c['id']}/ledger", timeout=30).json()["customer"]["balance"] == 300

    def test_supplier_crud_and_payment(self, owner):
        name = "TEST_Sup_" + uuid.uuid4().hex[:6]
        r = owner.post(f"{API}/suppliers", json={"name": name, "phone": "9333333333",
                       "opening_balance": 1000}, timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["balance"] == 1000
        pay = owner.post(f"{API}/payments", json={"party_type": "supplier", "party_id": s["id"],
                         "amount": 400, "method": "bank"}, timeout=30)
        assert pay.status_code == 200 and pay.json()["new_balance"] == 600
        led = owner.get(f"{API}/suppliers/{s['id']}/ledger", timeout=30).json()
        assert led["supplier"]["balance"] == 600
        assert any(e["debit"] == 400 for e in led["entries"])

    def test_payment_validation(self, owner):
        r = owner.post(f"{API}/payments", json={"party_type": "customer", "party_id": "nope",
                       "amount": 0}, timeout=30)
        assert r.status_code == 400
        r = owner.post(f"{API}/payments", json={"party_type": "customer", "party_id": "nope",
                       "amount": 10}, timeout=30)
        assert r.status_code == 404

    def test_ledger_404(self, owner):
        assert owner.get(f"{API}/customers/{uuid.uuid4()}/ledger", timeout=30).status_code == 404
        assert owner.get(f"{API}/suppliers/{uuid.uuid4()}/ledger", timeout=30).status_code == 404

    def test_payments_list(self, owner):
        r = owner.get(f"{API}/payments", params={"party_type": "customer"}, timeout=30)
        assert r.status_code == 200 and isinstance(r.json(), list)


# --------------------------- Expenses ---------------------------
class TestExpenses:
    def test_add_and_list_expense(self, owner):
        r = owner.post(f"{API}/expenses", json={"category": "Rent", "amount": 1234.5,
                       "method": "cash", "description": "TEST_expense"}, timeout=30)
        assert r.status_code == 200
        e = r.json()
        assert e["amount"] == 1234.5 and "_id" not in e
        lst = owner.get(f"{API}/expenses", timeout=30).json()
        assert any(x["id"] == e["id"] for x in lst)


# --------------------------- Settings / Staff ---------------------------
class TestSettings:
    def test_business_update(self, owner):
        biz = owner.get(f"{API}/auth/me", timeout=30).json()["business"]
        payload = {k: biz.get(k, "") for k in
                   ("name", "owner_name", "mobile", "email", "gstin", "drug_license",
                    "address", "state", "pincode", "logo", "signature", "invoice_prefix")}
        payload["gst_registered"] = biz.get("gst_registered", True)
        payload["mobile"] = "9876500001"
        r = owner.put(f"{API}/business", json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["mobile"] == "9876500001"

    def test_staff_list_and_add(self, owner):
        r = owner.get(f"{API}/staff", timeout=30)
        assert r.status_code == 200
        assert all("password_hash" not in s for s in r.json())
        email = f"test_staff_{uuid.uuid4().hex[:6]}@medistock.demo"
        a = owner.post(f"{API}/staff", json={"name": "TEST Staff", "email": email,
                       "password": "staff12345", "role": "cashier"}, timeout=30)
        assert a.status_code == 200, a.text[:300]
        assert a.json()["role"] == "cashier" and "password_hash" not in a.json()
        sid = a.json()["id"]
        # dup email
        d = owner.post(f"{API}/staff", json={"name": "x", "email": email,
                       "password": "staff12345", "role": "cashier"}, timeout=30)
        assert d.status_code == 400
        # invalid role
        i = owner.post(f"{API}/staff", json={"name": "x", "email": f"a{uuid.uuid4().hex[:5]}@t.com",
                       "password": "staff12345", "role": "owner"}, timeout=30)
        assert i.status_code == 400
        # deactivate then login blocked
        up = owner.put(f"{API}/staff/{sid}", json={"active": False}, timeout=30)
        assert up.status_code == 200
        import requests as rq
        lg = rq.post(f"{API}/auth/login", json={"email": email, "password": "staff12345"}, timeout=30)
        assert lg.status_code == 403


# --------------------------- RBAC ---------------------------
class TestRBAC:
    def test_cashier_permissions_payload(self, cashier):
        r = cashier.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        perms = r.json()["permissions"]
        assert set(perms) == {"dashboard", "pos", "sales", "customers", "udhar", "returns"}

    @pytest.mark.parametrize("path", ["/purchases", "/inventory",
                                      "/expenses", "/staff", "/audit-logs", "/reorder",
                                      "/expiry", "/reports/sales", "/export/products"])
    def test_cashier_blocked_modules(self, cashier, path):
        r = cashier.get(f"{API}{path}", timeout=30)
        assert r.status_code == 403, f"{path} returned {r.status_code}"

    def test_cashier_cannot_create_product_or_purchase(self, cashier):
        assert cashier.post(f"{API}/products", json={"name": "TEST_x"}, timeout=30).status_code == 403
        assert cashier.post(f"{API}/purchases", json={"supplier_id": "x", "items": []},
                            timeout=30).status_code == 403
        assert cashier.put(f"{API}/business", json={"name": "hack", "gst_registered": True},
                           timeout=30).status_code == 403

    def test_cashier_allowed_modules(self, cashier):
        assert cashier.get(f"{API}/dashboard", timeout=60).status_code == 200
        assert cashier.get(f"{API}/sales", timeout=60).status_code == 200
        assert cashier.get(f"{API}/customers", timeout=30).status_code == 200


def _fresh_batch(owner, qty=10):
    """Create a dedicated product + purchased batch so parallel tests don't collide."""
    sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
    prod = owner.post(f"{API}/products", json={
        "name": "TEST_Iso_" + uuid.uuid4().hex[:8], "gst_rate": 12,
        "mrp": 100, "purchase_rate": 60, "selling_rate": 95}, timeout=30).json()
    exp = (date.today() + timedelta(days=365)).isoformat()
    r = owner.post(f"{API}/purchases", json={
        "supplier_id": sup["id"], "supplier_invoice_no": "TEST-ISO-" + uuid.uuid4().hex[:5],
        "items": [{"product_id": prod["id"], "batch_number": "ISOB1", "expiry_date": exp,
                   "qty": qty, "free_qty": 0, "mrp": 100, "purchase_rate": 60,
                   "gst_rate": 12, "selling_price": 95}],
        "paid_amount": 0, "payment_method": "credit"}, timeout=60)
    assert r.status_code == 200, r.text[:300]
    batch = owner.get(f"{API}/products/{prod['id']}", timeout=30).json()["batches"][0]
    return prod, batch


# --------------------------- Iteration-3 fix verification ---------------------------
def _batch_qty(owner, product_id, batch_id):
    d = owner.get(f"{API}/products/{product_id}", timeout=30).json()
    return next(x for x in d["batches"] if x["id"] == batch_id)["available_qty"]


def _second_supplier(owner):
    sups = owner.get(f"{API}/suppliers", timeout=30).json()
    if len(sups) >= 2:
        return sups[0], sups[1]
    b = owner.post(f"{API}/suppliers", json={"name": "TEST_Sup_" + uuid.uuid4().hex[:6],
                   "mobile": "9000000001"}, timeout=30)
    assert b.status_code == 200, b.text[:300]
    return sups[0], b.json()


class TestIteration3Fixes:
    # FIX 1 - cumulative returned qty must be enforced and stock not inflated
    def test_fix1_over_return_rejected_and_stock_not_inflated(self, owner):
        p, b = _fresh_batch(owner)
        before = _batch_qty(owner, p["id"], b["id"])
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        assert _batch_qty(owner, p["id"], b["id"]) == before - 2
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        r1 = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                        "items": [{"sale_item_id": item["id"], "qty": 2}]}, timeout=30)
        assert r1.status_code == 200, r1.text[:300]
        assert _batch_qty(owner, p["id"], b["id"]) == before
        r2_ = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                         "items": [{"sale_item_id": item["id"], "qty": 2}]}, timeout=30)
        assert r2_.status_code == 400, f"over-return accepted: {r2_.text[:300]}"
        assert _batch_qty(owner, p["id"], b["id"]) == before, "stock inflated by repeated return"

    # FIX 1b - partial returns accumulate correctly
    def test_fix1b_partial_returns_accumulate(self, owner):
        p, b = _fresh_batch(owner)
        before = _batch_qty(owner, p["id"], b["id"])
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 3}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        for _ in range(2):
            r = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                           "items": [{"sale_item_id": item["id"], "qty": 1}]}, timeout=30)
            assert r.status_code == 200, r.text[:300]
        over = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                          "items": [{"sale_item_id": item["id"], "qty": 2}]}, timeout=30)
        assert over.status_code == 400, "return beyond remaining qty accepted"
        last = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                          "items": [{"sale_item_id": item["id"], "qty": 1}]}, timeout=30)
        assert last.status_code == 200, last.text[:300]
        assert _batch_qty(owner, p["id"], b["id"]) == before

    # FIX 2 - cancel after return must be blocked, no double restock
    def test_fix2_cancel_after_return_blocked(self, owner):
        p, b = _fresh_batch(owner)
        before = _batch_qty(owner, p["id"], b["id"])
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 2}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        assert owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                          "items": [{"sale_item_id": item["id"], "qty": 1}]},
                          timeout=30).status_code == 200
        c = owner.post(f"{API}/sales/{sale['id']}/cancel", timeout=30)
        assert c.status_code == 400, f"cancel after return allowed: {c.text[:200]}"
        assert _batch_qty(owner, p["id"], b["id"]) == before - 1

    # FIX 2b - returns on cancelled invoice blocked
    def test_fix2b_return_on_cancelled_sale_blocked(self, owner):
        p, b = _fresh_batch(owner)
        sale = owner.post(f"{API}/sales", json={
            "items": [{"product_id": p["id"], "batch_id": b["id"], "qty": 1}],
            "payment_method": "cash", "paid_amount": 0}, timeout=60).json()
        item = owner.get(f"{API}/sales/{sale['id']}", timeout=30).json()["items"][0]
        assert owner.post(f"{API}/sales/{sale['id']}/cancel", timeout=30).status_code == 200
        r = owner.post(f"{API}/sales-returns", json={"sale_id": sale["id"],
                       "items": [{"sale_item_id": item["id"], "qty": 1}]}, timeout=30)
        assert r.status_code == 400

    # FIX 3 - payment gating by module
    def test_fix3_cashier_supplier_payment_forbidden(self, cashier, owner):
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        r = cashier.post(f"{API}/payments", json={"party_type": "supplier",
                         "party_id": sup["id"], "amount": 10, "method": "cash"}, timeout=30)
        assert r.status_code == 403, f"cashier supplier payment allowed: {r.status_code}"

    def test_fix3b_cashier_customer_payment_allowed(self, cashier, owner):
        cust = owner.post(f"{API}/customers", json={"name": "TEST_PayCust_" + uuid.uuid4().hex[:5],
                          "mobile": "9" + uuid.uuid4().int.__str__()[:9],
                          "credit_limit": 1000}, timeout=30)
        assert cust.status_code == 200, cust.text[:300]
        cid = cust.json()["id"]
        r = cashier.post(f"{API}/payments", json={"party_type": "customer", "party_id": cid,
                         "amount": 10, "method": "cash"}, timeout=30)
        assert r.status_code == 200, f"cashier customer payment blocked: {r.text[:300]}"
        assert r.json()["new_balance"] == -10

    # FIX 4 - purchase return supplier must match batch supplier
    def test_fix4_purchase_return_supplier_mismatch(self, owner):
        supA, supB = _second_supplier(owner)
        prod = owner.post(f"{API}/products", json={
            "name": "TEST_PRet_" + uuid.uuid4().hex[:6], "gst_rate": 12,
            "mrp": 100, "purchase_rate": 60, "selling_rate": 95}, timeout=30).json()
        exp = (date.today() + timedelta(days=300)).isoformat()
        pur = owner.post(f"{API}/purchases", json={
            "supplier_id": supA["id"], "supplier_invoice_no": "TEST-PR-" + uuid.uuid4().hex[:5],
            "items": [{"product_id": prod["id"], "batch_number": "TESTPR1", "expiry_date": exp,
                       "qty": 10, "free_qty": 0, "mrp": 100, "purchase_rate": 60,
                       "gst_rate": 12, "selling_price": 95}],
            "paid_amount": 0, "payment_method": "credit"}, timeout=60)
        assert pur.status_code == 200, pur.text[:300]
        batch = owner.get(f"{API}/products/{prod['id']}", timeout=30).json()["batches"][0]
        bad = owner.post(f"{API}/purchase-returns", json={"supplier_id": supB["id"],
                         "batch_id": batch["id"], "qty": 1, "reason": "Damaged"}, timeout=30)
        assert bad.status_code == 400, f"mismatched supplier return accepted: {bad.status_code}"
        assert _batch_qty(owner, prod["id"], batch["id"]) == 10
        good = owner.post(f"{API}/purchase-returns", json={"supplier_id": supA["id"],
                          "batch_id": batch["id"], "qty": 1, "reason": "Damaged"}, timeout=30)
        assert good.status_code == 200, good.text[:300]
        assert _batch_qty(owner, prod["id"], batch["id"]) == 9
