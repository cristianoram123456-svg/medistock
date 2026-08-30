from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import io
import csv
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"

app = FastAPI(title="MediStock Pro API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medistock")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def uid() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def r2(x) -> float:
    try:
        return round(float(x) + 1e-9, 2)
    except (TypeError, ValueError):
        return 0.0

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(user_id: str, business_id: Optional[str], role: str) -> str:
    payload = {
        "sub": user_id,
        "bid": business_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

# Role permissions -> list of allowed modules
PERMISSIONS = {
    "owner": ["*"],
    "admin": ["dashboard", "pos", "sales", "purchases", "inventory", "products",
              "customers", "suppliers", "udhar", "expenses", "reports", "analytics",
              "settings", "staff", "returns", "expiry", "import"],
    "pharmacist": ["dashboard", "pos", "sales", "inventory", "products", "expiry",
                   "returns", "customers", "reports"],
    "cashier": ["dashboard", "pos", "sales", "customers", "udhar", "returns"],
    "inventory": ["dashboard", "purchases", "inventory", "products", "suppliers",
                  "expiry", "import", "returns"],
}

def can_access(role: str, module: str) -> bool:
    perms = PERMISSIONS.get(role, [])
    return "*" in perms or module in perms

# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
    user.pop("password_hash", None)
    return clean(user)

def require_module(module: str):
    async def dep(user: dict = Depends(get_current_user)):
        if not can_access(user.get("role", ""), module):
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return dep

async def audit(business_id: str, user: dict, action: str, record: str,
                old: Any = None, new: Any = None):
    await db.audit_logs.insert_one({
        "id": uid(), "business_id": business_id,
        "user_id": user.get("id"), "user_name": user.get("name"),
        "action": action, "record": record,
        "old_value": old, "new_value": new, "created_at": now_iso(),
    })

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class BusinessIn(BaseModel):
    name: str
    owner_name: str = ""
    mobile: str = ""
    email: str = ""
    gstin: str = ""
    drug_license: str = ""
    address: str = ""
    state: str = ""
    pincode: str = ""
    logo: str = ""
    signature: str = ""
    gst_registered: bool = True
    invoice_prefix: str = "INV"

class StaffIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    active: bool = True

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    count = await db.users.count_documents({})
    role = "owner" if count == 0 else (body.role or "cashier")
    user = {
        "id": uid(), "name": body.name, "email": email,
        "password_hash": hash_password(body.password),
        "role": role, "business_id": None, "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], None, role)
    return {"token": token, "user": {k: v for k, v in user.items()
            if k not in ("password_hash", "_id")}}

@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
    token = create_token(user["id"], user.get("business_id"), user["role"])
    user.pop("password_hash", None)
    return {"token": token, "user": clean(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    biz = None
    if user.get("business_id"):
        biz = clean(await db.businesses.find_one({"id": user["business_id"]}) or {})
    return {"user": user, "business": biz, "permissions": PERMISSIONS.get(user["role"], [])}

@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

# ---------------------------------------------------------------------------
# Business setup
# ---------------------------------------------------------------------------
@api.post("/business")
async def create_business(body: BusinessIn, user: dict = Depends(get_current_user)):
    if user.get("business_id"):
        raise HTTPException(status_code=400, detail="Business already set up")
    biz = body.model_dump()
    biz.update({
        "id": uid(), "owner_id": user["id"], "invoice_counter": 0,
        "settings": {"low_stock_default": 10, "expiry_alert_days": 90,
                     "round_off": True, "financial_year": "2026-27"},
        "created_at": now_iso(),
    })
    await db.businesses.insert_one(biz)
    await db.users.update_one({"id": user["id"]}, {"$set": {"business_id": biz["id"]}})
    token = create_token(user["id"], biz["id"], user["role"])
    return {"business": clean(biz), "token": token}

@api.put("/business")
async def update_business(body: BusinessIn, user: dict = Depends(require_module("settings"))):
    bid = user.get("business_id")
    if not bid:
        raise HTTPException(status_code=400, detail="No business")
    await db.businesses.update_one({"id": bid}, {"$set": body.model_dump()})
    await audit(bid, user, "business_updated", bid)
    return clean(await db.businesses.find_one({"id": bid}))

@api.put("/business/settings")
async def update_settings(settings: dict, user: dict = Depends(require_module("settings"))):
    bid = user["business_id"]
    await db.businesses.update_one({"id": bid}, {"$set": {"settings": settings}})
    return clean(await db.businesses.find_one({"id": bid}))

# ---------------------------------------------------------------------------
# Staff management
# ---------------------------------------------------------------------------
@api.get("/staff")
async def list_staff(user: dict = Depends(require_module("staff"))):
    staff = await db.users.find({"business_id": user["business_id"]}).to_list(500)
    for s in staff:
        s.pop("password_hash", None)
        clean(s)
    return staff

@api.post("/staff")
async def add_staff(body: StaffIn, user: dict = Depends(require_module("staff"))):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.role not in PERMISSIONS or body.role == "owner":
        raise HTTPException(status_code=400, detail="Invalid role")
    doc = {
        "id": uid(), "name": body.name, "email": email,
        "password_hash": hash_password(body.password), "role": body.role,
        "business_id": user["business_id"], "active": body.active,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await audit(user["business_id"], user, "staff_added", doc["id"], new=body.role)
    doc.pop("password_hash", None)
    return clean(doc)

@api.put("/staff/{sid}")
async def update_staff(sid: str, body: dict, user: dict = Depends(require_module("staff"))):
    target = await db.users.find_one({"id": sid, "business_id": user["business_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="Staff not found")
    upd = {}
    for k in ("name", "role", "active"):
        if k in body:
            upd[k] = body[k]
    if body.get("password"):
        upd["password_hash"] = hash_password(body["password"])
    await db.users.update_one({"id": sid}, {"$set": upd})
    await audit(user["business_id"], user, "staff_updated", sid, new=upd.get("role"))
    return {"ok": True}

# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
PRODUCT_FIELDS = [
    "name", "brand", "generic", "composition", "strength", "dosage_form",
    "manufacturer", "marketing_company", "category", "schedule",
    "prescription_required", "hsn", "gst_rate", "barcode", "sku", "pack_size",
    "unit", "mrp", "purchase_rate", "landing_rate", "selling_rate",
    "min_selling_rate", "profit_margin", "min_stock", "reorder_level",
    "rack", "storage", "image", "active", "substitutes", "preferred_supplier",
]

async def product_stock(product_id: str) -> Dict[str, float]:
    batches = await db.product_batches.find({"product_id": product_id}).to_list(1000)
    qty = sum(b.get("available_qty", 0) for b in batches)
    value = sum(b.get("available_qty", 0) * b.get("landing_cost", 0) for b in batches)
    return {"stock": qty, "stock_value": r2(value), "batch_count": len(batches)}

@api.get("/products")
async def list_products(user: dict = Depends(get_current_user),
                        search: str = "", category: str = "",
                        skip: int = 0, limit: int = 50):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if category:
        q["category"] = category
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"generic": {"$regex": search, "$options": "i"}},
            {"composition": {"$regex": search, "$options": "i"}},
            {"barcode": search},
            {"sku": {"$regex": search, "$options": "i"}},
        ]
    total = await db.products.count_documents(q)
    items = await db.products.find(q).skip(skip).limit(limit).to_list(limit)
    for it in items:
        clean(it)
        it.update(await product_stock(it["id"]))
    return {"total": total, "items": items}

@api.get("/products/{pid}")
async def get_product(pid: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"id": pid, "business_id": user["business_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    clean(p)
    p.update(await product_stock(pid))
    batches = await db.product_batches.find({"product_id": pid}).to_list(1000)
    for b in batches:
        clean(b)
    p["batches"] = sorted(batches, key=lambda x: x.get("expiry_date", ""))
    return p

@api.post("/products")
async def create_product(body: dict, user: dict = Depends(require_module("products"))):
    doc = {"id": uid(), "business_id": user["business_id"], "created_at": now_iso()}
    for f in PRODUCT_FIELDS:
        doc[f] = body.get(f, "" if f not in (
            "gst_rate", "mrp", "purchase_rate", "landing_rate", "selling_rate",
            "min_selling_rate", "profit_margin", "min_stock", "reorder_level")
            else 0)
    doc.setdefault("active", True)
    doc["active"] = body.get("active", True)
    doc["prescription_required"] = bool(body.get("prescription_required", False))
    await db.products.insert_one(doc)
    await audit(user["business_id"], user, "product_created", doc["id"], new=doc["name"])
    clean(doc)
    return doc

@api.put("/products/{pid}")
async def update_product(pid: str, body: dict, user: dict = Depends(require_module("products"))):
    p = await db.products.find_one({"id": pid, "business_id": user["business_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    upd = {f: body[f] for f in PRODUCT_FIELDS if f in body}
    await db.products.update_one({"id": pid}, {"$set": upd})
    await audit(user["business_id"], user, "product_updated", pid, old=p.get("name"))
    return clean(await db.products.find_one({"id": pid}))

@api.delete("/products/{pid}")
async def deactivate_product(pid: str, user: dict = Depends(require_module("products"))):
    await db.products.update_one({"id": pid, "business_id": user["business_id"]},
                                 {"$set": {"active": False}})
    await audit(user["business_id"], user, "product_deactivated", pid)
    return {"ok": True}

@api.post("/products/import")
async def import_products(body: dict, user: dict = Depends(require_module("import"))):
    """Bulk import medicine master from list of dicts."""
    rows = body.get("rows", [])
    created = 0
    for row in rows:
        if not row.get("name"):
            continue
        doc = {"id": uid(), "business_id": user["business_id"], "created_at": now_iso()}
        for f in PRODUCT_FIELDS:
            doc[f] = row.get(f, 0 if f in ("gst_rate", "mrp", "purchase_rate",
                     "selling_rate", "min_stock") else "")
        doc["active"] = True
        doc["prescription_required"] = bool(row.get("prescription_required", False))
        await db.products.insert_one(doc)
        created += 1
    await audit(user["business_id"], user, "products_imported", "bulk", new=created)
    return {"created": created}

@api.get("/categories")
async def categories(user: dict = Depends(get_current_user)):
    cats = await db.products.distinct("category", {"business_id": user["business_id"]})
    return [c for c in cats if c]

# ---------------------------------------------------------------------------
# Inventory / Batches
# ---------------------------------------------------------------------------
@api.get("/inventory")
async def inventory(user: dict = Depends(require_module("inventory")),
                    search: str = "", skip: int = 0, limit: int = 50):
    bid = user["business_id"]
    pq: Dict[str, Any] = {"business_id": bid}
    if search:
        pq["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"generic": {"$regex": search, "$options": "i"}},
        ]
    total = await db.products.count_documents(pq)
    prods = await db.products.find(pq).skip(skip).limit(limit).to_list(limit)
    out = []
    for p in prods:
        clean(p)
        st = await product_stock(p["id"])
        batches = await db.product_batches.find({"product_id": p["id"]}).to_list(1000)
        for b in batches:
            clean(b)
        out.append({**p, **st,
                    "batches": sorted(batches, key=lambda x: x.get("expiry_date", ""))})
    return {"total": total, "items": out}

class StockAdjustIn(BaseModel):
    batch_id: str
    qty: float
    reason: str
    type: str = "adjustment"  # adjustment | damaged | expired

@api.post("/inventory/adjust")
async def adjust_stock(body: StockAdjustIn, user: dict = Depends(require_module("inventory"))):
    bid = user["business_id"]
    batch = await db.product_batches.find_one({"id": body.batch_id, "business_id": bid})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    new_qty = batch["available_qty"] + body.qty  # qty can be negative
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Adjustment exceeds available stock")
    await db.product_batches.update_one({"id": body.batch_id},
                                        {"$set": {"available_qty": new_qty}})
    await db.stock_movements.insert_one({
        "id": uid(), "business_id": bid, "product_id": batch["product_id"],
        "batch_id": body.batch_id, "type": body.type, "qty": body.qty,
        "reason": body.reason, "balance": new_qty, "user_id": user["id"],
        "created_at": now_iso(),
    })
    await audit(bid, user, f"stock_{body.type}", body.batch_id, old=batch["available_qty"], new=new_qty)
    return {"ok": True, "available_qty": new_qty}

@api.get("/stock-movements")
async def stock_movements(user: dict = Depends(require_module("inventory")),
                          product_id: str = "", limit: int = 100):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if product_id:
        q["product_id"] = product_id
    mv = await db.stock_movements.find(q).sort("created_at", -1).limit(limit).to_list(limit)
    for m in mv:
        clean(m)
    return mv

# ---------------------------------------------------------------------------
# Expiry & Low stock
# ---------------------------------------------------------------------------
@api.get("/expiry")
async def expiry_dashboard(user: dict = Depends(require_module("expiry"))):
    bid = user["business_id"]
    today = date.today()
    buckets = {"expired": [], "d30": [], "d60": [], "d90": [], "d180": []}
    batches = await db.product_batches.find(
        {"business_id": bid, "available_qty": {"$gt": 0}}).to_list(5000)
    pmap = {}
    for b in batches:
        clean(b)
        exp = b.get("expiry_date")
        if not exp:
            continue
        try:
            ed = datetime.strptime(exp[:10], "%Y-%m-%d").date()
        except ValueError:
            continue
        days = (ed - today).days
        pid = b["product_id"]
        if pid not in pmap:
            p = await db.products.find_one({"id": pid})
            pmap[pid] = p.get("name") if p else "?"
        rec = {**b, "product_name": pmap[pid], "days_left": days,
               "stock_value": r2(b["available_qty"] * b.get("landing_cost", 0))}
        if days < 0:
            buckets["expired"].append(rec)
        elif days <= 30:
            buckets["d30"].append(rec)
        elif days <= 60:
            buckets["d60"].append(rec)
        elif days <= 90:
            buckets["d90"].append(rec)
        elif days <= 180:
            buckets["d180"].append(rec)
    return buckets

@api.get("/reorder")
async def reorder_list(user: dict = Depends(require_module("inventory"))):
    bid = user["business_id"]
    prods = await db.products.find({"business_id": bid, "active": True}).to_list(5000)
    out = []
    for p in prods:
        clean(p)
        st = await product_stock(p["id"])
        stock = st["stock"]
        min_stock = p.get("min_stock", 0) or 0
        reorder = p.get("reorder_level", 0) or 0
        threshold = max(min_stock, reorder)
        if threshold and stock <= threshold:
            status = "out" if stock <= 0 else ("critical" if stock <= min_stock else "low")
            out.append({
                "id": p["id"], "name": p["name"], "brand": p.get("brand", ""),
                "stock": stock, "min_stock": min_stock, "reorder_level": reorder,
                "suggested_qty": max(threshold * 2 - stock, threshold),
                "supplier": p.get("preferred_supplier", ""), "status": status,
            })
    return out

# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user), search: str = ""):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"phone": {"$regex": search, "$options": "i"}}]
    items = await db.customers.find(q).limit(200).to_list(200)
    for c in items:
        clean(c)
    return items

@api.post("/customers")
async def create_customer(body: dict, user: dict = Depends(require_module("customers"))):
    doc = {"id": uid(), "business_id": user["business_id"], "created_at": now_iso(),
           "name": body.get("name", ""), "phone": body.get("phone", ""),
           "email": body.get("email", ""), "address": body.get("address", ""),
           "gstin": body.get("gstin", ""), "credit_limit": body.get("credit_limit", 0),
           "notes": body.get("notes", ""),
           "opening_balance": r2(body.get("opening_balance", 0)),
           "balance": r2(body.get("opening_balance", 0))}
    await db.customers.insert_one(doc)
    if doc["opening_balance"]:
        await db.customer_ledger.insert_one({
            "id": uid(), "business_id": user["business_id"], "customer_id": doc["id"],
            "date": today_str(), "reference": "OPENING", "description": "Opening Balance",
            "debit": doc["opening_balance"], "credit": 0, "balance": doc["opening_balance"],
            "created_at": now_iso()})
    clean(doc)
    return doc

@api.put("/customers/{cid}")
async def update_customer(cid: str, body: dict, user: dict = Depends(require_module("customers"))):
    await db.customers.update_one({"id": cid, "business_id": user["business_id"]},
        {"$set": {k: body[k] for k in ("name", "phone", "email", "address", "gstin",
                                       "credit_limit", "notes") if k in body}})
    return clean(await db.customers.find_one({"id": cid}))

@api.get("/customers/{cid}/ledger")
async def customer_ledger(cid: str, user: dict = Depends(get_current_user)):
    cust = await db.customers.find_one({"id": cid, "business_id": user["business_id"]})
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    entries = await db.customer_ledger.find(
        {"customer_id": cid}).sort("created_at", 1).to_list(1000)
    for e in entries:
        clean(e)
    return {"customer": clean(cust), "entries": entries}

# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------
@api.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user), search: str = ""):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if search:
        q["name"] = {"$regex": search, "$options": "i"}
    items = await db.suppliers.find(q).limit(200).to_list(200)
    for s in items:
        clean(s)
    return items

@api.post("/suppliers")
async def create_supplier(body: dict, user: dict = Depends(require_module("suppliers"))):
    doc = {"id": uid(), "business_id": user["business_id"], "created_at": now_iso(),
           "name": body.get("name", ""), "contact_person": body.get("contact_person", ""),
           "phone": body.get("phone", ""), "email": body.get("email", ""),
           "address": body.get("address", ""), "gstin": body.get("gstin", ""),
           "drug_license": body.get("drug_license", ""),
           "payment_terms": body.get("payment_terms", ""), "notes": body.get("notes", ""),
           "opening_balance": r2(body.get("opening_balance", 0)),
           "balance": r2(body.get("opening_balance", 0))}
    await db.suppliers.insert_one(doc)
    if doc["opening_balance"]:
        await db.supplier_ledger.insert_one({
            "id": uid(), "business_id": user["business_id"], "supplier_id": doc["id"],
            "date": today_str(), "reference": "OPENING", "description": "Opening Balance",
            "debit": 0, "credit": doc["opening_balance"], "balance": doc["opening_balance"],
            "created_at": now_iso()})
    clean(doc)
    return doc

@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: dict, user: dict = Depends(require_module("suppliers"))):
    await db.suppliers.update_one({"id": sid, "business_id": user["business_id"]},
        {"$set": {k: body[k] for k in ("name", "contact_person", "phone", "email",
            "address", "gstin", "drug_license", "payment_terms", "notes") if k in body}})
    return clean(await db.suppliers.find_one({"id": sid}))

@api.get("/suppliers/{sid}/ledger")
async def supplier_ledger(sid: str, user: dict = Depends(get_current_user)):
    sup = await db.suppliers.find_one({"id": sid, "business_id": user["business_id"]})
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    entries = await db.supplier_ledger.find(
        {"supplier_id": sid}).sort("created_at", 1).to_list(1000)
    for e in entries:
        clean(e)
    return {"supplier": clean(sup), "entries": entries}

# ---------------------------------------------------------------------------
# Payments (customer receipts / supplier payments)
# ---------------------------------------------------------------------------
class PaymentIn(BaseModel):
    party_type: str  # customer | supplier
    party_id: str
    amount: float
    method: str = "cash"  # cash | upi | card | bank | other
    note: str = ""

@api.post("/payments")
async def record_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    bid = user["business_id"]
    amt = r2(body.amount)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    ref = "RCPT-" + uid()[:8].upper()
    if body.party_type == "customer":
        if not can_access(user["role"], "udhar") and not can_access(user["role"], "customers"):
            raise HTTPException(status_code=403, detail="No permission to record customer payments")
        cust = await db.customers.find_one({"id": body.party_id, "business_id": bid})
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")
        new_bal = r2(cust["balance"] - amt)
        await db.customers.update_one({"id": body.party_id}, {"$set": {"balance": new_bal}})
        await db.customer_ledger.insert_one({
            "id": uid(), "business_id": bid, "customer_id": body.party_id,
            "date": today_str(), "reference": ref,
            "description": f"Payment received ({body.method})",
            "debit": 0, "credit": amt, "balance": new_bal, "created_at": now_iso()})
    else:
        if not can_access(user["role"], "suppliers"):
            raise HTTPException(status_code=403, detail="No permission to record supplier payments")
        sup = await db.suppliers.find_one({"id": body.party_id, "business_id": bid})
        if not sup:
            raise HTTPException(status_code=404, detail="Supplier not found")
        new_bal = r2(sup["balance"] - amt)
        await db.suppliers.update_one({"id": body.party_id}, {"$set": {"balance": new_bal}})
        await db.supplier_ledger.insert_one({
            "id": uid(), "business_id": bid, "supplier_id": body.party_id,
            "date": today_str(), "reference": ref,
            "description": f"Payment made ({body.method})",
            "debit": amt, "credit": 0, "balance": new_bal, "created_at": now_iso()})
    await db.payments.insert_one({
        "id": uid(), "business_id": bid, "party_type": body.party_type,
        "party_id": body.party_id, "amount": amt, "method": body.method,
        "note": body.note, "reference": ref, "date": today_str(),
        "user_id": user["id"], "created_at": now_iso()})
    await audit(bid, user, "payment_recorded", ref, new=amt)
    return {"ok": True, "reference": ref, "new_balance": new_bal}

@api.get("/payments")
async def list_payments(user: dict = Depends(get_current_user),
                        party_type: str = "", limit: int = 100):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if party_type:
        q["party_type"] = party_type
    p = await db.payments.find(q).sort("created_at", -1).limit(limit).to_list(limit)
    for x in p:
        clean(x)
    return p

# ---------------------------------------------------------------------------
# Sales / POS  (FEFO, batch-level, atomic-ish)
# ---------------------------------------------------------------------------
class SaleItemIn(BaseModel):
    product_id: str
    batch_id: str
    qty: float
    discount_pct: float = 0

class SaleIn(BaseModel):
    customer_id: Optional[str] = None
    doctor_name: str = ""
    prescription_ref: str = ""
    items: List[SaleItemIn]
    bill_discount: float = 0
    payment_method: str = "cash"
    paid_amount: float = 0
    invoice_format: str = "A4"
    idempotency_key: Optional[str] = None

async def next_invoice_no(business: dict) -> str:
    biz = await db.businesses.find_one_and_update(
        {"id": business["id"]}, {"$inc": {"invoice_counter": 1}},
        return_document=True)
    n = biz["invoice_counter"]
    fy = biz.get("settings", {}).get("financial_year", "2026-27")
    prefix = biz.get("invoice_prefix", "INV")
    return f"{prefix}-{fy}-{n:06d}"

@api.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(require_module("pos"))):
    bid = user["business_id"]
    biz = await db.businesses.find_one({"id": bid})
    if not biz:
        raise HTTPException(status_code=400, detail="Business not configured")

    if body.idempotency_key:
        existing = await db.sales.find_one({"business_id": bid,
                                            "idempotency_key": body.idempotency_key})
        if existing:
            return clean(existing)
    if not body.items:
        raise HTTPException(status_code=400, detail="No items in bill")

    gst_reg = biz.get("gst_registered", True)
    today = date.today()
    line_docs = []
    # Validate all before mutating
    for it in body.items:
        batch = await db.product_batches.find_one({"id": it.batch_id, "business_id": bid})
        if not batch:
            raise HTTPException(status_code=400, detail="Batch not found")
        # never sell expired
        try:
            ed = datetime.strptime(batch["expiry_date"][:10], "%Y-%m-%d").date()
            if ed < today:
                raise HTTPException(status_code=400,
                    detail=f"Batch {batch['batch_number']} is expired and cannot be sold")
        except (ValueError, KeyError):
            pass
        if it.qty <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")
        if batch["available_qty"] < it.qty:
            prod = await db.products.find_one({"id": it.product_id})
            raise HTTPException(status_code=400,
                detail=f"Insufficient stock for {prod.get('name') if prod else ''} "
                       f"batch {batch['batch_number']} (have {batch['available_qty']})")
        prod = await db.products.find_one({"id": it.product_id})
        rate = r2(batch.get("selling_price") or prod.get("selling_rate", 0))
        gst_rate = float(prod.get("gst_rate", 0)) if gst_reg else 0
        gross = r2(rate * it.qty)
        disc = r2(gross * it.discount_pct / 100)
        taxable = r2(gross - disc)
        tax = r2(taxable * gst_rate / 100)
        landing = r2(batch.get("landing_cost", 0))
        line_docs.append({
            "product_id": it.product_id, "product_name": prod.get("name"),
            "batch_id": it.batch_id, "batch_number": batch["batch_number"],
            "expiry_date": batch.get("expiry_date"), "hsn": prod.get("hsn", ""),
            "qty": it.qty, "mrp": batch.get("mrp", 0), "rate": rate,
            "discount_pct": it.discount_pct, "discount": disc,
            "gst_rate": gst_rate, "taxable": taxable, "tax": tax,
            "cgst": r2(tax / 2), "sgst": r2(tax / 2), "igst": 0,
            "total": r2(taxable + tax),
            "cost": r2(landing * it.qty),
            "profit": r2(taxable - landing * it.qty),
            "_batch_new_qty": batch["available_qty"] - it.qty,
        })

    subtotal = r2(sum(l["taxable"] for l in line_docs))
    total_tax = r2(sum(l["tax"] for l in line_docs))
    bill_disc = r2(body.bill_discount)
    pre_round = r2(subtotal + total_tax - bill_disc)
    grand = round(pre_round)
    round_off = r2(grand - pre_round) if biz.get("settings", {}).get("round_off", True) else 0
    grand_total = r2(pre_round + round_off)
    total_profit = r2(sum(l["profit"] for l in line_docs) - bill_disc)
    paid = r2(body.paid_amount)
    balance = max(0.0, r2(grand_total - paid))

    inv_no = await next_invoice_no(biz)
    sale_id = uid()
    cust = None
    if body.customer_id:
        cust = await db.customers.find_one({"id": body.customer_id, "business_id": bid})

    sale = {
        "id": sale_id, "business_id": bid, "invoice_no": inv_no,
        "customer_id": body.customer_id,
        "customer_name": cust["name"] if cust else "Walk-in Customer",
        "doctor_name": body.doctor_name, "prescription_ref": body.prescription_ref,
        "date": today_str(), "subtotal": subtotal, "total_tax": total_tax,
        "cgst": r2(total_tax / 2), "sgst": r2(total_tax / 2), "igst": 0,
        "bill_discount": bill_disc, "round_off": round_off,
        "grand_total": grand_total, "paid_amount": paid, "balance": balance,
        "payment_method": body.payment_method, "invoice_format": body.invoice_format,
        "gst_invoice": gst_reg, "profit": total_profit, "status": "completed",
        "idempotency_key": body.idempotency_key,
        "user_id": user["id"], "created_at": now_iso(),
    }
    await db.sales.insert_one(sale)

    # Commit stock deductions + movements + sale items
    for l in line_docs:
        new_qty = l.pop("_batch_new_qty")
        await db.product_batches.update_one({"id": l["batch_id"]},
                                            {"$set": {"available_qty": new_qty}})
        await db.stock_movements.insert_one({
            "id": uid(), "business_id": bid, "product_id": l["product_id"],
            "batch_id": l["batch_id"], "type": "sale", "qty": -l["qty"],
            "reference": inv_no, "balance": new_qty, "user_id": user["id"],
            "created_at": now_iso()})
        await db.sale_items.insert_one({"id": uid(), "business_id": bid,
                                        "sale_id": sale_id, **l})

    # Payment / ledger
    if body.customer_id and balance > 0:
        new_bal = r2((cust["balance"] if cust else 0) + balance)
        await db.customers.update_one({"id": body.customer_id}, {"$set": {"balance": new_bal}})
        await db.customer_ledger.insert_one({
            "id": uid(), "business_id": bid, "customer_id": body.customer_id,
            "date": today_str(), "reference": inv_no,
            "description": "Credit Sale", "debit": balance, "credit": 0,
            "balance": new_bal, "created_at": now_iso()})
    if paid > 0:
        await db.payments.insert_one({
            "id": uid(), "business_id": bid, "party_type": "customer",
            "party_id": body.customer_id, "amount": paid,
            "method": body.payment_method, "reference": inv_no,
            "note": "Sale payment", "date": today_str(),
            "user_id": user["id"], "created_at": now_iso()})
    await audit(bid, user, "invoice_created", inv_no, new=grand_total)
    return clean(sale)

@api.get("/sales")
async def list_sales(user: dict = Depends(get_current_user),
                     start: str = "", end: str = "", customer_id: str = "",
                     skip: int = 0, limit: int = 50):
    q: Dict[str, Any] = {"business_id": user["business_id"]}
    if customer_id:
        q["customer_id"] = customer_id
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    total = await db.sales.count_documents(q)
    items = await db.sales.find(q).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    for s in items:
        clean(s)
    return {"total": total, "items": items}

@api.get("/sales/{sid}")
async def get_sale(sid: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sid, "business_id": user["business_id"]})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    clean(sale)
    items = await db.sale_items.find({"sale_id": sid}).to_list(500)
    for i in items:
        clean(i)
    sale["items"] = items
    sale["business"] = clean(await db.businesses.find_one({"id": user["business_id"]}))
    return sale

@api.post("/sales/{sid}/cancel")
async def cancel_sale(sid: str, user: dict = Depends(require_module("sales"))):
    bid = user["business_id"]
    sale = await db.sales.find_one({"id": sid, "business_id": bid})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Already cancelled")
    existing_returns = await db.sales_returns.count_documents({"business_id": bid, "sale_id": sid})
    if existing_returns:
        raise HTTPException(status_code=400,
            detail="This invoice has sales returns and cannot be cancelled")
    items = await db.sale_items.find({"sale_id": sid}).to_list(500)
    for it in items:
        batch = await db.product_batches.find_one({"id": it["batch_id"]})
        if batch:
            nq = batch["available_qty"] + it["qty"]
            await db.product_batches.update_one({"id": it["batch_id"]},
                                                {"$set": {"available_qty": nq}})
            await db.stock_movements.insert_one({
                "id": uid(), "business_id": bid, "product_id": it["product_id"],
                "batch_id": it["batch_id"], "type": "cancel", "qty": it["qty"],
                "reference": sale["invoice_no"], "balance": nq,
                "user_id": user["id"], "created_at": now_iso()})
    await db.sales.update_one({"id": sid}, {"$set": {"status": "cancelled"}})
    await audit(bid, user, "invoice_cancelled", sale["invoice_no"])
    return {"ok": True}

# ---------------------------------------------------------------------------
# Sales Return
# ---------------------------------------------------------------------------
class ReturnItemIn(BaseModel):
    sale_item_id: str
    qty: float

class SalesReturnIn(BaseModel):
    sale_id: str
    items: List[ReturnItemIn]
    reason: str = ""
    restock: bool = True

@api.post("/sales-returns")
async def create_sales_return(body: SalesReturnIn, user: dict = Depends(require_module("returns"))):
    bid = user["business_id"]
    sale = await db.sales.find_one({"id": body.sale_id, "business_id": bid})
    if not sale:
        raise HTTPException(status_code=404, detail="Original sale not found")
    if sale.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot return items of a cancelled invoice")
    # cumulative returned qty per sale_item across prior returns
    prior = await db.sales_returns.find({"business_id": bid, "sale_id": body.sale_id}).to_list(1000)
    already: Dict[str, float] = {}
    for pr in prior:
        for it in pr.get("items", []):
            k = it.get("sale_item_id")
            if k:
                already[k] = already.get(k, 0) + it.get("qty", 0)
    ret_no = "SR-" + uid()[:8].upper()
    total_refund = 0.0
    ret_items = []
    for ri in body.items:
        si = await db.sale_items.find_one({"id": ri.sale_item_id, "sale_id": body.sale_id})
        if not si or ri.qty <= 0:
            continue
        remaining = si["qty"] - already.get(ri.sale_item_id, 0)
        if ri.qty > remaining:
            raise HTTPException(status_code=400,
                detail=f"Return qty exceeds returnable qty for {si['product_name']} "
                       f"(sold {si['qty']}, already returned {already.get(ri.sale_item_id, 0)})")
        unit_total = r2(si["total"] / si["qty"])
        refund = r2(unit_total * ri.qty)
        total_refund += refund
        ret_items.append({"sale_item_id": ri.sale_item_id, "product_id": si["product_id"],
                          "product_name": si["product_name"],
                          "batch_id": si["batch_id"], "qty": ri.qty, "refund": refund})
        if body.restock:
            batch = await db.product_batches.find_one({"id": si["batch_id"]})
            if batch:
                nq = batch["available_qty"] + ri.qty
                await db.product_batches.update_one({"id": si["batch_id"]},
                                                    {"$set": {"available_qty": nq}})
                await db.stock_movements.insert_one({
                    "id": uid(), "business_id": bid, "product_id": si["product_id"],
                    "batch_id": si["batch_id"], "type": "sales_return", "qty": ri.qty,
                    "reference": ret_no, "balance": nq, "user_id": user["id"],
                    "created_at": now_iso()})
    total_refund = r2(total_refund)
    doc = {"id": uid(), "business_id": bid, "return_no": ret_no,
           "sale_id": body.sale_id, "invoice_no": sale["invoice_no"],
           "customer_id": sale.get("customer_id"), "reason": body.reason,
           "items": ret_items, "refund_amount": total_refund, "restock": body.restock,
           "date": today_str(), "user_id": user["id"], "created_at": now_iso()}
    await db.sales_returns.insert_one(doc)
    # credit customer ledger
    if sale.get("customer_id"):
        cust = await db.customers.find_one({"id": sale["customer_id"]})
        if cust:
            nb = r2(cust["balance"] - total_refund)
            await db.customers.update_one({"id": sale["customer_id"]}, {"$set": {"balance": nb}})
            await db.customer_ledger.insert_one({
                "id": uid(), "business_id": bid, "customer_id": sale["customer_id"],
                "date": today_str(), "reference": ret_no, "description": "Sales Return",
                "debit": 0, "credit": total_refund, "balance": nb, "created_at": now_iso()})
    await audit(bid, user, "sales_return", ret_no, new=total_refund)
    clean(doc)
    return doc

@api.get("/sales-returns")
async def list_sales_returns(user: dict = Depends(get_current_user), limit: int = 100):
    r = await db.sales_returns.find({"business_id": user["business_id"]}).sort(
        "created_at", -1).limit(limit).to_list(limit)
    for x in r:
        clean(x)
    return r

# ---------------------------------------------------------------------------
# Purchases
# ---------------------------------------------------------------------------
class PurchaseItemIn(BaseModel):
    product_id: str
    batch_number: str
    expiry_date: str
    mfg_date: str = ""
    qty: float
    free_qty: float = 0
    mrp: float
    purchase_rate: float
    discount_pct: float = 0
    gst_rate: float = 0
    selling_price: float = 0

class PurchaseIn(BaseModel):
    supplier_id: str
    supplier_invoice_no: str = ""
    invoice_date: str = ""
    due_date: str = ""
    items: List[PurchaseItemIn]
    paid_amount: float = 0
    payment_method: str = "credit"

@api.post("/purchases")
async def create_purchase(body: PurchaseIn, user: dict = Depends(require_module("purchases"))):
    bid = user["business_id"]
    supplier = await db.suppliers.find_one({"id": body.supplier_id, "business_id": bid})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if not body.items:
        raise HTTPException(status_code=400, detail="No items")
    pur_no = "PUR-" + uid()[:8].upper()
    pid = uid()
    grand = 0.0
    for it in body.items:
        gross = r2(it.purchase_rate * it.qty)
        disc = r2(gross * it.discount_pct / 100)
        taxable = r2(gross - disc)
        tax = r2(taxable * it.gst_rate / 100)
        total = r2(taxable + tax)
        total_units = it.qty + it.free_qty
        landing = r2((taxable + tax) / total_units) if total_units else 0
        grand += total
        batch = {
            "id": uid(), "business_id": bid, "product_id": it.product_id,
            "batch_number": it.batch_number, "expiry_date": it.expiry_date,
            "mfg_date": it.mfg_date, "purchase_qty": it.qty, "free_qty": it.free_qty,
            "available_qty": total_units, "mrp": it.mrp,
            "purchase_rate": it.purchase_rate, "discount": disc, "gst": it.gst_rate,
            "landing_cost": landing, "selling_price": it.selling_price or it.mrp,
            "profit": r2((it.selling_price or it.mrp) - landing),
            "profit_pct": r2(((it.selling_price or it.mrp) - landing) / landing * 100) if landing else 0,
            "supplier_id": body.supplier_id, "purchase_no": pur_no,
            "purchase_date": body.invoice_date or today_str(), "created_at": now_iso(),
        }
        await db.product_batches.insert_one(batch)
        await db.purchase_items.insert_one({
            "id": uid(), "business_id": bid, "purchase_id": pid,
            "product_id": it.product_id, "batch_id": batch["id"],
            "batch_number": it.batch_number, "qty": it.qty, "free_qty": it.free_qty,
            "mrp": it.mrp, "purchase_rate": it.purchase_rate, "discount": disc,
            "gst_rate": it.gst_rate, "landing_cost": landing, "total": total,
            "created_at": now_iso()})
        await db.stock_movements.insert_one({
            "id": uid(), "business_id": bid, "product_id": it.product_id,
            "batch_id": batch["id"], "type": "purchase", "qty": total_units,
            "reference": pur_no, "balance": total_units, "user_id": user["id"],
            "created_at": now_iso()})
    grand = r2(grand)
    paid = r2(body.paid_amount)
    balance = r2(grand - paid)
    doc = {"id": pid, "business_id": bid, "purchase_no": pur_no,
           "supplier_id": body.supplier_id, "supplier_name": supplier["name"],
           "supplier_invoice_no": body.supplier_invoice_no,
           "invoice_date": body.invoice_date or today_str(), "due_date": body.due_date,
           "date": today_str(), "grand_total": grand, "paid_amount": paid,
           "balance": balance, "payment_method": body.payment_method,
           "user_id": user["id"], "created_at": now_iso()}
    await db.purchases.insert_one(doc)
    if balance > 0:
        nb = r2(supplier["balance"] + balance)
        await db.suppliers.update_one({"id": body.supplier_id}, {"$set": {"balance": nb}})
        await db.supplier_ledger.insert_one({
            "id": uid(), "business_id": bid, "supplier_id": body.supplier_id,
            "date": today_str(), "reference": pur_no, "description": "Purchase (credit)",
            "debit": 0, "credit": balance, "balance": nb, "created_at": now_iso()})
    await audit(bid, user, "purchase_added", pur_no, new=grand)
    clean(doc)
    return doc

@api.get("/purchases")
async def list_purchases(user: dict = Depends(require_module("purchases")),
                         skip: int = 0, limit: int = 50):
    q = {"business_id": user["business_id"]}
    total = await db.purchases.count_documents(q)
    items = await db.purchases.find(q).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    for p in items:
        clean(p)
    return {"total": total, "items": items}

@api.get("/purchases/{pid}")
async def get_purchase(pid: str, user: dict = Depends(require_module("purchases"))):
    p = await db.purchases.find_one({"id": pid, "business_id": user["business_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")
    clean(p)
    items = await db.purchase_items.find({"purchase_id": pid}).to_list(500)
    for i in items:
        clean(i)
    p["items"] = items
    return p

# ---------------------------------------------------------------------------
# Purchase CSV Import
# ---------------------------------------------------------------------------
@api.post("/purchases/import/preview")
async def import_preview(body: dict, user: dict = Depends(require_module("import"))):
    """body: { csv: '<raw csv text>' }"""
    bid = user["business_id"]
    raw = body.get("csv", "")
    reader = csv.DictReader(io.StringIO(raw))
    rows = []
    products = await db.products.find({"business_id": bid}).to_list(10000)
    pname = {p["name"].strip().lower(): p for p in products}
    for i, row in enumerate(reader):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        name = row.get("product") or row.get("name") or ""
        errors = []
        matched = pname.get(name.lower())
        def num(v):
            try:
                return float(str(v).replace(",", "").strip() or 0)
            except ValueError:
                return None
        qty = num(row.get("qty"))
        rate = num(row.get("rate") or row.get("purchase_rate"))
        mrp = num(row.get("mrp"))
        if not name:
            errors.append("Missing product name")
        if qty is None or qty <= 0:
            errors.append("Invalid quantity")
        if not row.get("batch"):
            errors.append("Missing batch")
        if not row.get("expiry"):
            errors.append("Missing expiry")
        rows.append({
            "row": i + 1, "product": name,
            "matched": bool(matched), "product_id": matched["id"] if matched else None,
            "is_new": not matched,
            "batch": row.get("batch", ""), "expiry": row.get("expiry", ""),
            "qty": qty or 0, "free_qty": num(row.get("free qty") or row.get("free_qty")) or 0,
            "mrp": mrp or 0, "rate": rate or 0,
            "discount": num(row.get("discount")) or 0,
            "gst": num(row.get("gst")) or 0, "hsn": row.get("hsn", ""),
            "manufacturer": row.get("manufacturer", ""),
            "errors": errors,
        })
    summary = {
        "total": len(rows),
        "matched": sum(1 for r in rows if r["matched"]),
        "new_products": sum(1 for r in rows if r["is_new"]),
        "errors": sum(1 for r in rows if r["errors"]),
    }
    return {"rows": rows, "summary": summary}

@api.post("/purchases/import/commit")
async def import_commit(body: dict, user: dict = Depends(require_module("import"))):
    """body: { supplier_id, supplier_invoice_no, rows: [validated rows] }"""
    bid = user["business_id"]
    rows = body.get("rows", [])
    supplier_id = body.get("supplier_id")
    supplier = await db.suppliers.find_one({"id": supplier_id, "business_id": bid})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier required")
    items = []
    for r in rows:
        if r.get("errors"):
            continue
        pid = r.get("product_id")
        if not pid:
            # create new product
            np = {"id": uid(), "business_id": bid, "name": r["product"],
                  "brand": r["product"], "generic": "", "composition": "",
                  "manufacturer": r.get("manufacturer", ""), "category": "Medicine",
                  "hsn": r.get("hsn", ""), "gst_rate": r.get("gst", 0),
                  "mrp": r.get("mrp", 0), "purchase_rate": r.get("rate", 0),
                  "selling_rate": r.get("mrp", 0), "unit": "pcs", "pack_size": "1",
                  "min_stock": 10, "active": True, "prescription_required": False,
                  "created_at": now_iso()}
            for f in PRODUCT_FIELDS:
                np.setdefault(f, "" if f not in ("gst_rate", "mrp", "purchase_rate",
                              "selling_rate", "min_stock", "reorder_level") else 0)
            await db.products.insert_one(np)
            pid = np["id"]
        items.append(PurchaseItemIn(
            product_id=pid, batch_number=r["batch"], expiry_date=r["expiry"],
            qty=r["qty"], free_qty=r.get("free_qty", 0), mrp=r["mrp"],
            purchase_rate=r["rate"], discount_pct=r.get("discount", 0),
            gst_rate=r.get("gst", 0), selling_price=r.get("mrp", 0)))
    if not items:
        raise HTTPException(status_code=400, detail="No valid rows to import")
    purchase = await create_purchase(PurchaseIn(
        supplier_id=supplier_id, supplier_invoice_no=body.get("supplier_invoice_no", ""),
        items=items, payment_method="credit"), user)
    return {"imported": len(items), "purchase": purchase}

@api.post("/purchases/import/file")
async def import_from_file(
    file: UploadFile = File(...),
    supplier_id: str = Form(...),
    supplier_invoice_no: str = Form(""),
    user: dict = Depends(require_module("import")),
):
    """OCR/text-extract a PDF or photo of a supplier bill and auto-create the purchase."""
    import billparse
    bid = user["business_id"]
    supplier = await db.suppliers.find_one({"id": supplier_id, "business_id": bid})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier required")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    text = billparse.extract_text(file.filename or "bill", content)
    parsed = billparse.parse_rows(text)
    if not parsed:
        raise HTTPException(status_code=422,
            detail="Could not read any line items from this bill. The scan may be unclear — "
                   "try a sharper photo, a clearer PDF, or use CSV import.")
    # match products by name
    products = await db.products.find({"business_id": bid}).to_list(20000)
    pname = {p["name"].strip().lower(): p for p in products}
    items, new_count, matched = [], 0, 0
    for r in parsed:
        m = pname.get(r["product"].strip().lower())
        pid = m["id"] if m else None
        if pid:
            matched += 1
        else:
            new_count += 1
            np = {"id": uid(), "business_id": bid, "name": r["product"], "brand": r["product"],
                  "manufacturer": r.get("manufacturer", ""), "category": "Medicine",
                  "hsn": r.get("hsn", ""), "gst_rate": r.get("gst", 0), "mrp": r.get("mrp", 0),
                  "purchase_rate": r.get("rate", 0), "selling_rate": r.get("mrp", 0),
                  "unit": "pcs", "pack_size": "1", "min_stock": 10, "active": True,
                  "prescription_required": False, "created_at": now_iso()}
            for f in PRODUCT_FIELDS:
                np.setdefault(f, "" if f not in ("gst_rate", "mrp", "purchase_rate",
                              "selling_rate", "min_stock", "reorder_level") else 0)
            await db.products.insert_one(np)
            pid = np["id"]
        items.append(PurchaseItemIn(
            product_id=pid, batch_number=r["batch"], expiry_date=r["expiry"], qty=r["qty"],
            free_qty=r.get("free_qty", 0), mrp=r["mrp"], purchase_rate=r["rate"],
            discount_pct=r.get("discount", 0), gst_rate=r.get("gst", 0),
            selling_price=r.get("mrp", 0)))
    purchase = await create_purchase(PurchaseIn(
        supplier_id=supplier_id, supplier_invoice_no=supplier_invoice_no,
        items=items, payment_method="credit"), user)
    await audit(bid, user, "purchase_ocr_import", purchase["purchase_no"], new=len(items))
    return {"source": file.filename, "line_items": len(items), "matched": matched,
            "new_products": new_count, "parsed_rows": parsed, "purchase": purchase}

# ---------------------------------------------------------------------------
# Purchase Return
# ---------------------------------------------------------------------------
class PurchaseReturnIn(BaseModel):
    supplier_id: str
    batch_id: str
    qty: float
    reason: str = "Expired"

@api.post("/purchase-returns")
async def create_purchase_return(body: PurchaseReturnIn, user: dict = Depends(require_module("returns"))):
    bid = user["business_id"]
    batch = await db.product_batches.find_one({"id": body.batch_id, "business_id": bid})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if body.qty <= 0 or body.qty > batch["available_qty"]:
        raise HTTPException(status_code=400, detail="Invalid return quantity")
    supplier = await db.suppliers.find_one({"id": body.supplier_id, "business_id": bid})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if batch.get("supplier_id") and batch["supplier_id"] != body.supplier_id \
            and batch.get("purchase_no") != "SEED":
        raise HTTPException(status_code=400,
            detail="This batch was not purchased from the selected supplier")
    nq = batch["available_qty"] - body.qty
    await db.product_batches.update_one({"id": body.batch_id}, {"$set": {"available_qty": nq}})
    ret_no = "PR-" + uid()[:8].upper()
    value = r2(batch.get("landing_cost", 0) * body.qty)
    await db.stock_movements.insert_one({
        "id": uid(), "business_id": bid, "product_id": batch["product_id"],
        "batch_id": body.batch_id, "type": "purchase_return", "qty": -body.qty,
        "reason": body.reason, "reference": ret_no, "balance": nq,
        "user_id": user["id"], "created_at": now_iso()})
    prod = await db.products.find_one({"id": batch["product_id"]})
    doc = {"id": uid(), "business_id": bid, "return_no": ret_no,
           "supplier_id": body.supplier_id, "supplier_name": supplier["name"],
           "product_id": batch["product_id"], "product_name": prod.get("name") if prod else "",
           "batch_id": body.batch_id, "batch_number": batch["batch_number"],
           "qty": body.qty, "reason": body.reason, "value": value,
           "date": today_str(), "user_id": user["id"], "created_at": now_iso()}
    await db.purchase_returns.insert_one(doc)
    nb = r2(supplier["balance"] - value)
    await db.suppliers.update_one({"id": body.supplier_id}, {"$set": {"balance": nb}})
    await db.supplier_ledger.insert_one({
        "id": uid(), "business_id": bid, "supplier_id": body.supplier_id,
        "date": today_str(), "reference": ret_no,
        "description": f"Purchase Return ({body.reason})", "debit": value, "credit": 0,
        "balance": nb, "created_at": now_iso()})
    await audit(bid, user, "purchase_return", ret_no, new=value)
    clean(doc)
    return doc

@api.get("/purchase-returns")
async def list_purchase_returns(user: dict = Depends(get_current_user), limit: int = 100):
    r = await db.purchase_returns.find({"business_id": user["business_id"]}).sort(
        "created_at", -1).limit(limit).to_list(limit)
    for x in r:
        clean(x)
    return r

# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------
@api.get("/expenses")
async def list_expenses(user: dict = Depends(require_module("expenses")), limit: int = 200):
    e = await db.expenses.find({"business_id": user["business_id"]}).sort(
        "created_at", -1).limit(limit).to_list(limit)
    for x in e:
        clean(x)
    return e

@api.post("/expenses")
async def create_expense(body: dict, user: dict = Depends(require_module("expenses"))):
    doc = {"id": uid(), "business_id": user["business_id"],
           "date": body.get("date") or today_str(),
           "category": body.get("category", "Other"), "amount": r2(body.get("amount", 0)),
           "method": body.get("method", "cash"), "description": body.get("description", ""),
           "receipt": body.get("receipt", ""), "user_id": user["id"], "created_at": now_iso()}
    await db.expenses.insert_one(doc)
    await audit(user["business_id"], user, "expense_added", doc["id"], new=doc["amount"])
    clean(doc)
    return doc

# ---------------------------------------------------------------------------
# Dashboard & Reports & Analytics
# ---------------------------------------------------------------------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(require_module("dashboard"))):
    bid = user["business_id"]
    today = today_str()
    sales_today = await db.sales.find({"business_id": bid, "date": today,
                                       "status": "completed"}).to_list(5000)
    purch_today = await db.purchases.find({"business_id": bid, "date": today}).to_list(5000)
    today_sales = r2(sum(s["grand_total"] for s in sales_today))
    today_profit = r2(sum(s.get("profit", 0) for s in sales_today))
    today_purchases = r2(sum(p["grand_total"] for p in purch_today))

    customers = await db.customers.find({"business_id": bid}).to_list(10000)
    suppliers = await db.suppliers.find({"business_id": bid}).to_list(10000)
    outstanding_credit = r2(sum(max(c["balance"], 0) for c in customers))
    supplier_payables = r2(sum(max(s["balance"], 0) for s in suppliers))

    batches = await db.product_batches.find({"business_id": bid}).to_list(50000)
    inv_value = r2(sum(b["available_qty"] * b.get("landing_cost", 0) for b in batches))

    # low/out stock counts
    prods = await db.products.find({"business_id": bid, "active": True}).to_list(50000)
    stock_by_prod: Dict[str, float] = {}
    for b in batches:
        stock_by_prod[b["product_id"]] = stock_by_prod.get(b["product_id"], 0) + b["available_qty"]
    low = out = 0
    for p in prods:
        s = stock_by_prod.get(p["id"], 0)
        thr = max(p.get("min_stock", 0) or 0, p.get("reorder_level", 0) or 0)
        if s <= 0:
            out += 1
        elif thr and s <= thr:
            low += 1

    td = date.today()
    expiring = expired = 0
    for b in batches:
        if b["available_qty"] <= 0 or not b.get("expiry_date"):
            continue
        try:
            ed = datetime.strptime(b["expiry_date"][:10], "%Y-%m-%d").date()
        except ValueError:
            continue
        d = (ed - td).days
        if d < 0:
            expired += 1
        elif d <= 90:
            expiring += 1

    total_paid = r2(sum(s["paid_amount"] for s in sales_today))
    return {
        "today_sales": today_sales, "today_purchases": today_purchases,
        "today_profit": today_profit, "gross_profit": today_profit,
        "outstanding_credit": outstanding_credit, "supplier_payables": supplier_payables,
        "inventory_value": inv_value, "low_stock": low, "out_of_stock": out,
        "expiring": expiring, "expired": expired,
        "invoice_count": len(sales_today),
        "today_customers": len(set(s.get("customer_id") for s in sales_today if s.get("customer_id"))),
        "pending_payments": r2(sum(s["balance"] for s in sales_today)),
        "cash_collected": total_paid,
    }

@api.get("/dashboard/charts")
async def dashboard_charts(user: dict = Depends(require_module("dashboard"))):
    bid = user["business_id"]
    # last 7 days sales vs purchases
    days = [(date.today() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    sales = await db.sales.find({"business_id": bid, "status": "completed",
                                 "date": {"$in": days}}).to_list(20000)
    purch = await db.purchases.find({"business_id": bid, "date": {"$in": days}}).to_list(20000)
    daily = []
    for d in days:
        s = sum(x["grand_total"] for x in sales if x["date"] == d)
        p = sum(x["grand_total"] for x in purch if x["date"] == d)
        pr = sum(x.get("profit", 0) for x in sales if x["date"] == d)
        daily.append({"date": d[5:], "sales": r2(s), "purchases": r2(p), "profit": r2(pr)})

    # top selling products (last 30 days)
    cutoff = (date.today() - timedelta(days=30)).strftime("%Y-%m-%d")
    recent_sales = await db.sales.find({"business_id": bid, "date": {"$gte": cutoff},
                                        "status": "completed"}).to_list(50000)
    sale_ids = [s["id"] for s in recent_sales]
    items = await db.sale_items.find({"sale_id": {"$in": sale_ids}}).to_list(200000)
    top: Dict[str, dict] = {}
    for it in items:
        t = top.setdefault(it["product_name"], {"name": it["product_name"], "qty": 0, "revenue": 0})
        t["qty"] += it["qty"]
        t["revenue"] = r2(t["revenue"] + it["total"])
    top_products = sorted(top.values(), key=lambda x: x["qty"], reverse=True)[:8]

    # payment mode split (last 30 days)
    modes: Dict[str, float] = {}
    for s in recent_sales:
        modes[s["payment_method"]] = r2(modes.get(s["payment_method"], 0) + s["paid_amount"])
    payment_split = [{"name": k, "value": v} for k, v in modes.items()]
    return {"daily": daily, "top_products": top_products, "payment_split": payment_split}

@api.get("/reports/sales")
async def report_sales(user: dict = Depends(require_module("reports")),
                       start: str = "", end: str = ""):
    bid = user["business_id"]
    q: Dict[str, Any] = {"business_id": bid, "status": "completed"}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    sales = await db.sales.find(q).to_list(50000)
    total = r2(sum(s["grand_total"] for s in sales))
    profit = r2(sum(s.get("profit", 0) for s in sales))
    tax = r2(sum(s.get("total_tax", 0) for s in sales))
    return {"count": len(sales), "total": total, "profit": profit, "tax": tax,
            "cgst": r2(tax / 2), "sgst": r2(tax / 2),
            "sales": [clean(s) for s in sales]}

@api.get("/reports/gst")
async def report_gst(user: dict = Depends(require_module("reports")),
                     start: str = "", end: str = ""):
    bid = user["business_id"]
    q: Dict[str, Any] = {"business_id": bid, "status": "completed"}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    sales = await db.sales.find(q).to_list(50000)
    sale_ids = [s["id"] for s in sales]
    items = await db.sale_items.find({"sale_id": {"$in": sale_ids}}).to_list(200000)
    hsn: Dict[str, dict] = {}
    for it in items:
        key = it.get("hsn") or "NA"
        h = hsn.setdefault(key, {"hsn": key, "gst_rate": it.get("gst_rate", 0),
                                 "taxable": 0, "cgst": 0, "sgst": 0, "total_tax": 0})
        h["taxable"] = r2(h["taxable"] + it["taxable"])
        h["cgst"] = r2(h["cgst"] + it.get("cgst", 0))
        h["sgst"] = r2(h["sgst"] + it.get("sgst", 0))
        h["total_tax"] = r2(h["total_tax"] + it["tax"])
    return {"hsn_summary": list(hsn.values())}

@api.get("/reports/stock-valuation")
async def report_stock_valuation(user: dict = Depends(require_module("reports"))):
    bid = user["business_id"]
    batches = await db.product_batches.find({"business_id": bid,
                                             "available_qty": {"$gt": 0}}).to_list(50000)
    total_cost = r2(sum(b["available_qty"] * b.get("landing_cost", 0) for b in batches))
    total_mrp = r2(sum(b["available_qty"] * b.get("mrp", 0) for b in batches))
    return {"total_cost": total_cost, "total_mrp": total_mrp,
            "potential_profit": r2(total_mrp - total_cost), "batch_count": len(batches)}

@api.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_module("settings")), limit: int = 200):
    logs = await db.audit_logs.find({"business_id": user["business_id"]}).sort(
        "created_at", -1).limit(limit).to_list(limit)
    for l in logs:
        clean(l)
    return logs

@api.get("/export/{collection}")
async def export_collection(collection: str, user: dict = Depends(require_module("reports"))):
    allowed = {"products", "customers", "suppliers", "sales", "purchases",
               "expenses", "product_batches"}
    if collection not in allowed:
        raise HTTPException(status_code=400, detail="Export not allowed")
    docs = await db[collection].find({"business_id": user["business_id"]}).to_list(50000)
    for d in docs:
        clean(d)
    return {"collection": collection, "count": len(docs), "data": docs}

@api.get("/")
async def root():
    return {"service": "MediStock Pro API", "status": "ok"}

# ---------------------------------------------------------------------------
# Admin control panel  (owner + admin)
# ---------------------------------------------------------------------------
def require_owner(user: dict = Depends(get_current_user)):
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user

@api.get("/admin/overview")
async def admin_overview(user: dict = Depends(require_module("settings"))):
    bid = user["business_id"]
    cols = ["products", "product_batches", "customers", "suppliers", "sales",
            "purchases", "sales_returns", "purchase_returns", "payments",
            "expenses", "stock_movements", "audit_logs"]
    counts = {}
    for c in cols:
        counts[c] = await db[c].count_documents({"business_id": bid})
    staff = await db.users.count_documents({"business_id": bid})
    roles = {}
    async for u in db.users.find({"business_id": bid}):
        roles[u["role"]] = roles.get(u["role"], 0) + 1
    return {"counts": counts, "staff": staff, "roles": roles,
            "permissions_matrix": PERMISSIONS}

@api.post("/admin/clear-transactions")
async def clear_transactions(user: dict = Depends(require_owner)):
    """Danger zone: wipe all transactional data, keep masters. Resets balances."""
    bid = user["business_id"]
    for c in ["sales", "sale_items", "purchases", "purchase_items", "sales_returns",
              "purchase_returns", "stock_movements", "customer_ledger",
              "supplier_ledger", "payments", "expenses", "audit_logs"]:
        await db[c].delete_many({"business_id": bid})
    # reset party balances to opening and re-post opening ledger entries
    async for cst in db.customers.find({"business_id": bid}):
        ob = cst.get("opening_balance", 0)
        await db.customers.update_one({"id": cst["id"]}, {"$set": {"balance": ob}})
        if ob:
            await db.customer_ledger.insert_one({
                "id": uid(), "business_id": bid, "customer_id": cst["id"],
                "date": today_str(), "reference": "OPENING", "description": "Opening Balance",
                "debit": ob, "credit": 0, "balance": ob, "created_at": now_iso()})
    async for sup in db.suppliers.find({"business_id": bid}):
        ob = sup.get("opening_balance", 0)
        await db.suppliers.update_one({"id": sup["id"]}, {"$set": {"balance": ob}})
        if ob:
            await db.supplier_ledger.insert_one({
                "id": uid(), "business_id": bid, "supplier_id": sup["id"],
                "date": today_str(), "reference": "OPENING", "description": "Opening Balance",
                "debit": 0, "credit": ob, "balance": ob, "created_at": now_iso()})
    await db.businesses.update_one({"id": bid}, {"$set": {"invoice_counter": 0}})
    return {"ok": True, "message": "Transactional data cleared. Masters & opening balances kept."}

@api.post("/admin/products/deactivate-zero-stock")
async def deactivate_zero_stock(user: dict = Depends(require_module("settings"))):
    bid = user["business_id"]
    prods = await db.products.find({"business_id": bid, "active": True}).to_list(50000)
    n = 0
    for p in prods:
        st = await product_stock(p["id"])
        if st["stock"] <= 0:
            await db.products.update_one({"id": p["id"]}, {"$set": {"active": False}})
            n += 1
    return {"deactivated": n}

# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("business_id")
    await db.products.create_index([("business_id", 1), ("name", 1)])
    await db.products.create_index([("business_id", 1), ("barcode", 1)])
    await db.product_batches.create_index([("business_id", 1), ("product_id", 1)])
    await db.product_batches.create_index([("business_id", 1), ("expiry_date", 1)])
    await db.sales.create_index([("business_id", 1), ("date", 1)])
    await db.customer_ledger.create_index("customer_id")
    await db.supplier_ledger.create_index("supplier_id")
    from seed import seed_all
    await seed_all(db)

@app.on_event("shutdown")
async def shutdown():
    client.close()
