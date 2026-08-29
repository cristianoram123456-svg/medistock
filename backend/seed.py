"""Demo data seeding for MediStock Pro (development only)."""
import os
import uuid
from datetime import datetime, timezone, timedelta, date
import bcrypt


def uid():
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hp(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def r2(x):
    return round(float(x) + 1e-9, 2)


async def seed_all(db):
    owner_email = os.environ.get("ADMIN_EMAIL", "owner@example.com").lower()
    owner_pw = os.environ.get("ADMIN_PASSWORD", "medistock123")

    existing = await db.users.find_one({"email": owner_email})
    if existing:
        return  # already seeded

    bid = uid()
    owner_id = uid()
    business = {
        "id": bid, "owner_id": owner_id, "name": "Sanjeevani Medical Store",
        "owner_name": "Cristiano Ram", "mobile": "9876543210", "email": owner_email,
        "gstin": "27ABCDE1234F1Z5", "drug_license": "MH-DL-20B-123456",
        "address": "Shop 12, MG Road, Pune", "state": "Maharashtra", "pincode": "411001",
        "logo": "", "signature": "", "gst_registered": True, "invoice_prefix": "INV",
        "invoice_counter": 0,
        "settings": {"low_stock_default": 10, "expiry_alert_days": 90,
                     "round_off": True, "financial_year": "2026-27"},
        "created_at": now_iso(),
    }
    await db.businesses.insert_one(business)

    users = [
        {"id": owner_id, "name": "Cristiano Ram", "email": owner_email,
         "password_hash": hp(owner_pw), "role": "owner", "business_id": bid,
         "active": True, "created_at": now_iso()},
        {"id": uid(), "name": "Admin Manager", "email": "admin@medistock.demo",
         "password_hash": hp("staff123"), "role": "admin", "business_id": bid,
         "active": True, "created_at": now_iso()},
        {"id": uid(), "name": "Ravi Cashier", "email": "cashier@medistock.demo",
         "password_hash": hp("staff123"), "role": "cashier", "business_id": bid,
         "active": True, "created_at": now_iso()},
        {"id": uid(), "name": "Priya Pharmacist", "email": "pharmacist@medistock.demo",
         "password_hash": hp("staff123"), "role": "pharmacist", "business_id": bid,
         "active": True, "created_at": now_iso()},
        {"id": uid(), "name": "Sunil Inventory", "email": "inventory@medistock.demo",
         "password_hash": hp("staff123"), "role": "inventory", "business_id": bid,
         "active": True, "created_at": now_iso()},
    ]
    await db.users.insert_many(users)

    # Suppliers
    suppliers = [
        {"name": "MediPlus Distributors", "contact_person": "Amit Shah",
         "phone": "9820011122", "gstin": "27AAACM1234A1Z1", "opening_balance": 0},
        {"name": "HealthCare Pharma Agency", "contact_person": "Neha Verma",
         "phone": "9820033344", "gstin": "27AAACH5678B1Z2", "opening_balance": 12500},
        {"name": "Wellness Wholesale", "contact_person": "Rakesh Gupta",
         "phone": "9820055566", "gstin": "27AAACW9012C1Z3", "opening_balance": 0},
    ]
    sup_docs = []
    for s in suppliers:
        d = {"id": uid(), "business_id": bid, "created_at": now_iso(),
             "email": "", "address": "Pune", "drug_license": "MH-WL-123",
             "payment_terms": "30 days", "notes": "",
             "balance": r2(s["opening_balance"]), **s}
        d["opening_balance"] = r2(s["opening_balance"])
        sup_docs.append(d)
    await db.suppliers.insert_many(sup_docs)

    # Customers
    customers = [
        {"name": "Walk-in Regular", "phone": "9000000001", "opening_balance": 0, "credit_limit": 0},
        {"name": "Mahesh Patil", "phone": "9000000002", "opening_balance": 1500, "credit_limit": 5000},
        {"name": "Sunita Deshmukh", "phone": "9000000003", "opening_balance": 0, "credit_limit": 3000},
        {"name": "Dr. Kulkarni Clinic", "phone": "9000000004", "opening_balance": 4200,
         "credit_limit": 20000, "gstin": "27AAAPC1234D1Z4"},
    ]
    cust_docs = []
    for c in customers:
        d = {"id": uid(), "business_id": bid, "created_at": now_iso(),
             "email": "", "address": "Pune", "gstin": c.get("gstin", ""), "notes": "",
             "opening_balance": r2(c["opening_balance"]), "balance": r2(c["opening_balance"])}
        d.update({k: c[k] for k in ("name", "phone", "credit_limit")})
        cust_docs.append(d)
    await db.customers.insert_many(cust_docs)
    for c in cust_docs:
        if c["opening_balance"]:
            await db.customer_ledger.insert_one({
                "id": uid(), "business_id": bid, "customer_id": c["id"],
                "date": date.today().strftime("%Y-%m-%d"), "reference": "OPENING",
                "description": "Opening Balance", "debit": c["opening_balance"],
                "credit": 0, "balance": c["opening_balance"], "created_at": now_iso()})

    # Products
    products_raw = [
        ("Dolo 650 Tablet", "Dolo", "Paracetamol", "Paracetamol 650mg", "650mg", "Tablet",
         "Micro Labs", "Analgesic", "3004", 12, "8901234500011", 30.50, 22.0, 28.0, "8901234500011"),
        ("Azithral 500 Tablet", "Azithral", "Azithromycin", "Azithromycin 500mg", "500mg", "Tablet",
         "Alembic", "Antibiotic", "3004", 12, "8901234500028", 118.0, 82.0, 105.0, "8901234500028", True),
        ("Pan 40 Tablet", "Pan", "Pantoprazole", "Pantoprazole 40mg", "40mg", "Tablet",
         "Alkem", "Antacid", "3004", 12, "8901234500035", 145.0, 96.0, 130.0, "8901234500035"),
        ("Crocin Advance", "Crocin", "Paracetamol", "Paracetamol 500mg", "500mg", "Tablet",
         "GSK", "Analgesic", "3004", 12, "8901234500042", 25.0, 17.0, 22.0, "8901234500042"),
        ("Volini Spray", "Volini", "Diclofenac", "Diclofenac Diethylamine", "50g", "Spray",
         "Sun Pharma", "Pain Relief", "3004", 18, "8901234500059", 210.0, 150.0, 195.0, "8901234500059"),
        ("Cetrizine 10mg", "Cetzine", "Cetirizine", "Cetirizine 10mg", "10mg", "Tablet",
         "Dr Reddys", "Antihistamine", "3004", 12, "8901234500066", 32.0, 20.0, 28.0, "8901234500066"),
        ("Digene Gel Mint", "Digene", "Antacid", "Magaldrate + Simethicone", "200ml", "Syrup",
         "Abbott", "Antacid", "3004", 12, "8901234500073", 155.0, 108.0, 140.0, "8901234500073"),
        ("Betadine Ointment", "Betadine", "Povidone Iodine", "Povidone Iodine 5%", "20g", "Ointment",
         "Win Medicare", "Antiseptic", "3005", 12, "8901234500080", 95.0, 66.0, 88.0, "8901234500080"),
        ("Vicks VapoRub", "Vicks", "Menthol", "Menthol + Camphor", "50ml", "Balm",
         "P&G", "OTC", "3004", 18, "8901234500097", 165.0, 120.0, 152.0, "8901234500097"),
        ("Dettol Antiseptic", "Dettol", "Chloroxylenol", "Chloroxylenol 4.8%", "250ml", "Liquid",
         "Reckitt", "Personal Care", "3808", 18, "8901234500103", 145.0, 102.0, 135.0, "8901234500103"),
        ("ORS Powder", "Electral", "ORS", "Oral Rehydration Salts", "21.8g", "Powder",
         "FDC", "OTC", "3004", 5, "8901234500110", 22.0, 15.0, 20.0, "8901234500110"),
        ("Thermometer Digital", "Dr Trust", "Device", "Digital Thermometer", "1 unit", "Device",
         "Nureca", "Medical Device", "9025", 12, "8901234500127", 250.0, 160.0, 230.0, "8901234500127"),
    ]
    prod_docs = []
    for row in products_raw:
        presc = len(row) > 17 and row[17]
        d = {
            "id": uid(), "business_id": bid, "created_at": now_iso(),
            "name": row[0], "brand": row[1], "generic": row[2], "composition": row[3],
            "strength": row[4], "dosage_form": row[5], "manufacturer": row[6],
            "marketing_company": row[6], "category": row[7], "schedule": "H" if presc else "",
            "prescription_required": bool(presc), "hsn": row[8], "gst_rate": row[9],
            "barcode": row[10], "sku": row[10][-6:], "pack_size": "10", "unit": "strip",
            "mrp": row[11], "purchase_rate": row[12], "landing_rate": row[12],
            "selling_rate": row[13], "min_selling_rate": row[12], "profit_margin": 0,
            "min_stock": 15, "reorder_level": 20, "rack": "A1", "storage": "Cool & dry",
            "image": "", "active": True, "substitutes": "", "preferred_supplier": "",
        }
        prod_docs.append(d)
    await db.products.insert_many(prod_docs)

    # Batches (2 per product, with varied expiry incl near-expiry)
    today = date.today()
    batch_docs = []
    for i, p in enumerate(prod_docs):
        for j in range(2):
            # vary expiry: some near, some far, one expired for demo
            if i == 1 and j == 1:
                exp = today - timedelta(days=10)   # expired batch (won't sell via FEFO)
            elif i % 4 == 0 and j == 0:
                exp = today + timedelta(days=25)   # near expiry
            else:
                exp = today + timedelta(days=200 + i * 15 + j * 90)
            landing = r2(p["purchase_rate"] * 1.05)
            qty = 40 if j == 0 else 60
            batch_docs.append({
                "id": uid(), "business_id": bid, "product_id": p["id"],
                "batch_number": f"B{1000 + i}{j}", "expiry_date": exp.strftime("%Y-%m-%d"),
                "mfg_date": (exp - timedelta(days=730)).strftime("%Y-%m-%d"),
                "purchase_qty": qty, "free_qty": 0, "available_qty": qty,
                "mrp": p["mrp"], "purchase_rate": p["purchase_rate"], "discount": 0,
                "gst": p["gst_rate"], "landing_cost": landing,
                "selling_price": p["selling_rate"],
                "profit": r2(p["selling_rate"] - landing),
                "profit_pct": r2((p["selling_rate"] - landing) / landing * 100),
                "supplier_id": sup_docs[i % 3]["id"], "purchase_no": "SEED",
                "purchase_date": (today - timedelta(days=30)).strftime("%Y-%m-%d"),
                "created_at": now_iso(),
            })
    await db.product_batches.insert_many(batch_docs)

    # A few historical sales across last 7 days for charts
    import random
    random.seed(7)
    fy = business["settings"]["financial_year"]
    counter = 0
    for day_off in range(7, 0, -1):
        d = today - timedelta(days=day_off)
        for _ in range(random.randint(2, 5)):
            counter += 1
            p = random.choice(prod_docs)
            qty = random.randint(1, 4)
            rate = p["selling_rate"]
            gst = p["gst_rate"]
            taxable = r2(rate * qty)
            tax = r2(taxable * gst / 100)
            pre = r2(taxable + tax)
            grand = round(pre)
            landing = r2(p["purchase_rate"] * 1.05)
            profit = r2(taxable - landing * qty)
            method = random.choice(["cash", "upi", "card"])
            sid = uid()
            inv = f"INV-{fy}-{counter:06d}"
            await db.sales.insert_one({
                "id": sid, "business_id": bid, "invoice_no": inv, "customer_id": None,
                "customer_name": "Walk-in Customer", "doctor_name": "", "prescription_ref": "",
                "date": d.strftime("%Y-%m-%d"), "subtotal": taxable, "total_tax": tax,
                "cgst": r2(tax / 2), "sgst": r2(tax / 2), "igst": 0, "bill_discount": 0,
                "round_off": r2(grand - pre), "grand_total": r2(grand), "paid_amount": r2(grand),
                "balance": 0, "payment_method": method, "invoice_format": "A4",
                "gst_invoice": True, "profit": profit, "status": "completed",
                "idempotency_key": None, "user_id": owner_id,
                "created_at": (datetime.now(timezone.utc) - timedelta(days=day_off)).isoformat(),
            })
            await db.sale_items.insert_one({
                "id": uid(), "business_id": bid, "sale_id": sid, "product_id": p["id"],
                "product_name": p["name"], "batch_id": "seed", "batch_number": "SEED",
                "expiry_date": "", "hsn": p["hsn"], "qty": qty, "mrp": p["mrp"],
                "rate": rate, "discount_pct": 0, "discount": 0, "gst_rate": gst,
                "taxable": taxable, "tax": tax, "cgst": r2(tax / 2), "sgst": r2(tax / 2),
                "igst": 0, "total": pre, "cost": r2(landing * qty), "profit": profit,
                "created_at": now_iso()})
    await db.businesses.update_one({"id": bid}, {"$set": {"invoice_counter": counter}})

    # Expenses
    exp_cats = [("Rent", 15000), ("Electricity", 3200), ("Salary", 25000), ("Internet", 999)]
    for cat, amt in exp_cats:
        await db.expenses.insert_one({
            "id": uid(), "business_id": bid, "date": today.strftime("%Y-%m-%d"),
            "category": cat, "amount": r2(amt), "method": "bank",
            "description": f"{cat} - monthly", "receipt": "", "user_id": owner_id,
            "created_at": now_iso()})
