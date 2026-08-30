"""Tests for NEW features: Admin Panel endpoints + OCR bill scan purchase import."""
import io
import re

import pytest
import requests

from conftest import API


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login",
               json={"email": "admin@medistock.demo", "password": "staff123"}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


def _bill_png(rows):
    """Generate a monospace bill image: Product Batch Expiry Qty MRP Rate."""
    from PIL import Image, ImageDraw, ImageFont
    lines = ["SUPPLIER BILL", "Product   Batch   Expiry   Qty   MRP   Rate"] + rows
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
    except Exception:
        font = ImageFont.load_default()
    img = Image.new("RGB", (1500, 120 + 70 * len(lines)), "white")
    d = ImageDraw.Draw(img)
    y = 40
    for ln in lines:
        d.text((40, y), ln, fill="black", font=font)
        y += 70
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --------------------------------------------------------------- Admin overview
class TestAdminOverview:
    def test_owner_overview(self, owner):
        r = owner.get(f"{API}/admin/overview", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("counts", "staff", "roles", "permissions_matrix"):
            assert k in d
        for c in ("products", "sales", "purchases", "customers", "suppliers", "payments",
                  "product_batches"):
            assert isinstance(d["counts"][c], int)
        assert d["permissions_matrix"]["owner"] == ["*"]
        assert "settings" in d["permissions_matrix"]["admin"]
        assert "settings" not in d["permissions_matrix"]["cashier"]
        assert d["staff"] >= 1

    def test_admin_can_view_overview(self, admin):
        r = admin.get(f"{API}/admin/overview", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert "counts" in r.json()

    def test_cashier_forbidden(self, cashier):
        r = cashier.get(f"{API}/admin/overview", timeout=30)
        assert r.status_code == 403, r.text[:200]

    def test_anon_unauthorised(self, anon):
        assert anon.get(f"{API}/admin/overview", timeout=30).status_code == 401


# ------------------------------------------------------------------ Danger zone
class TestDangerZone:
    def test_clear_transactions_admin_forbidden(self, admin):
        r = admin.post(f"{API}/admin/clear-transactions", timeout=30)
        assert r.status_code == 403
        assert "Owner" in r.json().get("detail", "")

    def test_clear_transactions_cashier_forbidden(self, cashier):
        assert cashier.post(f"{API}/admin/clear-transactions", timeout=30).status_code == 403

    def test_deactivate_zero_stock(self, owner):
        before = owner.get(f"{API}/products", params={"limit": 500}, timeout=60).json()["items"]
        active_before = {p["id"] for p in before if p.get("active")}
        r = owner.post(f"{API}/admin/products/deactivate-zero-stock", timeout=120)
        assert r.status_code == 200, r.text[:300]
        n = r.json()["deactivated"]
        assert isinstance(n, int) and n >= 0
        after = owner.get(f"{API}/products", params={"limit": 500}, timeout=60).json()["items"]
        active_after = {p["id"] for p in after if p.get("active")}
        removed = active_before - active_after
        assert len(removed) == n, f"reported {n} deactivated but list dropped {len(removed)}"
        # no active product should still be zero-stock
        assert not [p for p in after if p.get("active") and p.get("stock", 0) <= 0]
        # idempotent second run
        assert owner.post(f"{API}/admin/products/deactivate-zero-stock",
                          timeout=120).json()["deactivated"] == 0
        # restore demo data
        for pid in removed:
            owner.put(f"{API}/products/{pid}", json={"active": True}, timeout=30)


# ------------------------------------------------------- Medicine bulk import
class TestMedicineImport:
    created = []

    def test_import_products_and_persist(self, owner):
        rows = [
            {"name": "TEST_ScanMed A", "brand": "TESTB", "generic": "Paracetamol",
             "manufacturer": "TESTM", "category": "Analgesic", "hsn": "3004",
             "gst_rate": 12, "mrp": 28, "purchase_rate": 19, "selling_rate": 25,
             "min_stock": 15},
            {"name": "TEST_ScanMed B", "gst_rate": 5, "mrp": 110, "purchase_rate": 78,
             "selling_rate": 100, "min_stock": 10},
            {"name": "", "mrp": 5},  # skipped
        ]
        r = owner.post(f"{API}/products/import", json={"rows": rows}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["created"] == 2

        lst = owner.get(f"{API}/products", params={"search": "TEST_ScanMed", "limit": 50},
                        timeout=60).json()["items"]
        names = {p["name"] for p in lst}
        assert "TEST_ScanMed A" in names and "TEST_ScanMed B" in names
        a = next(p for p in lst if p["name"] == "TEST_ScanMed A")
        TestMedicineImport.created = [p["id"] for p in lst if p["name"].startswith("TEST_ScanMed")]
        assert a["gst_rate"] == 12 and a["mrp"] == 28 and a["min_stock"] == 15

    def test_import_cashier_forbidden(self, cashier):
        r = cashier.post(f"{API}/products/import", json={"rows": [{"name": "TEST_nope"}]},
                         timeout=30)
        assert r.status_code == 403

    def test_export_products_csv_source(self, owner):
        r = owner.get(f"{API}/export/products", timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["collection"] == "products" and d["count"] == len(d["data"])
        assert d["data"] and "_id" not in d["data"][0]

    def test_export_invalid_collection(self, owner):
        assert owner.get(f"{API}/export/users", timeout=30).status_code == 400

    @classmethod
    def teardown_class(cls):
        pass  # cleanup handled in cleanup fixture below


@pytest.fixture(scope="module", autouse=True)
def _cleanup(owner):
    yield
    for p in owner.get(f"{API}/products", params={"search": "TEST", "limit": 200},
                       timeout=60).json().get("items", []):
        if p["name"].upper().startswith("TEST"):
            owner.delete(f"{API}/products/{p['id']}", timeout=30)


# ----------------------------------------------------- OCR bill file import
class TestScanBillImport:
    def test_missing_supplier_404(self, owner):
        s = requests.Session()
        s.headers.update({"Authorization": owner.headers["Authorization"]})
        r = s.post(f"{API}/purchases/import/file",
                   files={"file": ("bill.png", _bill_png(["Calpol 500 B1 08/2027 10 28 19"]),
                                   "image/png")},
                   data={"supplier_id": "does-not-exist"}, timeout=120)
        assert r.status_code == 404, r.text[:300]

    def test_missing_file_422(self, owner):
        s = requests.Session()
        s.headers.update({"Authorization": owner.headers["Authorization"]})
        r = s.post(f"{API}/purchases/import/file", data={"supplier_id": "x"}, timeout=60)
        assert r.status_code == 422

    def test_unreadable_image_422(self, owner):
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        s = requests.Session()
        s.headers.update({"Authorization": owner.headers["Authorization"]})
        blank = _bill_png(["no line items here"])
        r = s.post(f"{API}/purchases/import/file",
                   files={"file": ("blank.png", blank, "image/png")},
                   data={"supplier_id": sup["id"]}, timeout=180)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:300]}"
        assert "Could not read" in r.json().get("detail", "")

    def test_scan_creates_purchase_and_increases_stock(self, owner):
        sup = owner.get(f"{API}/suppliers", timeout=30).json()[0]
        rows = ["TESTMED Alpha   BT9001   08/2027   10   120   80",
                "TESTMED Beta   BT9002   11/2028   5   90   60"]
        s = requests.Session()
        s.headers.update({"Authorization": owner.headers["Authorization"]})
        r = s.post(f"{API}/purchases/import/file",
                   files={"file": ("bill.png", _bill_png(rows), "image/png")},
                   data={"supplier_id": sup["id"], "supplier_invoice_no": "TEST_OCR-1"},
                   timeout=240)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert d["line_items"] >= 1
        assert d["matched"] + d["new_products"] == d["line_items"]
        pur = d["purchase"]
        assert pur["purchase_no"] and pur["grand_total"] > 0
        assert len(d["parsed_rows"]) == d["line_items"]
        for row in d["parsed_rows"]:
            assert re.match(r"^\d{4}-\d{2}-\d{2}$", row["expiry"])
            assert row["qty"] >= 1

        # purchase persisted & listed in history
        hist = owner.get(f"{API}/purchases", params={"limit": 50}, timeout=60).json()
        items = hist["items"] if isinstance(hist, dict) else hist
        assert any(p["purchase_no"] == pur["purchase_no"] for p in items), \
            "OCR purchase not found in purchases history"

        det = owner.get(f"{API}/purchases/{pur['id']}", timeout=30)
        assert det.status_code == 200
        assert det.json()["supplier_invoice_no"] == "TEST_OCR-1"

        # every parsed row must exist as a product batch with the imported qty
        for row in d["parsed_rows"]:
            found = owner.get(f"{API}/products", params={"search": row["product"], "limit": 10},
                              timeout=60).json()["items"]
            match = [p for p in found if p["name"].strip().lower() == row["product"].strip().lower()]
            assert match, f"product {row['product']!r} not created/matched"
            detail = owner.get(f"{API}/products/{match[0]['id']}", timeout=30).json()
            batches = [b for b in detail["batches"] if b["batch_number"] == row["batch"]]
            assert batches, f"no batch {row['batch']} for {row['product']}"
            assert sum(b["available_qty"] for b in batches) >= row["qty"]
            assert detail["stock"] >= row["qty"], "stock not increased by OCR purchase"


# --------------------------------------------- Staff role security (new UI flow)
class TestStaffRoleSecurity:
    def test_add_staff_rejects_owner_role(self, owner):
        r = owner.post(f"{API}/staff", json={"name": "TEST_OwnerEsc",
                       "email": "test_owneresc@medistock.demo", "password": "staff123",
                       "role": "owner"}, timeout=30)
        assert r.status_code == 400, f"owner role should be rejected, got {r.status_code}"

    def test_put_staff_rejects_invalid_role(self, owner):
        """PUT /staff must validate the role value like POST /staff does."""
        created = owner.post(f"{API}/staff", json={"name": "TEST_RoleVal",
                             "email": "test_roleval@medistock.demo", "password": "staff123",
                             "role": "cashier"}, timeout=30)
        if created.status_code == 400:  # already exists from a previous run
            staff = owner.get(f"{API}/staff", timeout=30).json()
            sid = next(s["id"] for s in staff if s["email"] == "test_roleval@medistock.demo")
        else:
            assert created.status_code == 200, created.text[:200]
            sid = created.json()["id"]
        try:
            r = owner.put(f"{API}/staff/{sid}", json={"role": "not-a-role"}, timeout=30)
            assert r.status_code == 400, \
                f"PUT /staff accepted bogus role (status {r.status_code}) — no role validation"
        finally:
            owner.put(f"{API}/staff/{sid}", json={"role": "cashier", "active": False}, timeout=30)

    def test_admin_cannot_escalate_self_to_owner(self, admin, owner):
        me = admin.get(f"{API}/auth/me", timeout=30).json()["user"]
        sid = me["id"]
        try:
            r = admin.put(f"{API}/staff/{sid}", json={"role": "owner"}, timeout=30)
            after = owner.get(f"{API}/staff", timeout=30).json()
            role = next(s["role"] for s in after if s["id"] == sid)
            assert role != "owner", \
                f"PRIVILEGE ESCALATION: admin self-promoted to owner (PUT status {r.status_code})"
        finally:
            owner.put(f"{API}/staff/{sid}", json={"role": "admin", "active": True}, timeout=30)

    def test_admin_cannot_modify_owner_account(self, admin, owner):
        staff = owner.get(f"{API}/staff", timeout=30).json()
        ow = next(s for s in staff if s["role"] == "owner")
        r = admin.put(f"{API}/staff/{ow['id']}", json={"name": ow["name"]}, timeout=30)
        assert r.status_code in (400, 403), \
            f"admin able to modify the owner account (status {r.status_code})"
