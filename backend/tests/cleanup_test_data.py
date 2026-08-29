"""Utility: deactivate TEST_/QA products created by the automated suites (keeps demo clean)."""
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

s = requests.Session()
tok = s.post(f"{BASE}/auth/login", json={"email": "cristianoram123456@gmail.com",
                                         "password": "medistock123"}, timeout=30).json()["token"]
s.headers.update({"Authorization": f"Bearer {tok}"})

items = s.get(f"{BASE}/products", params={"limit": 500}, timeout=60).json()["items"]
removed = 0
for p in items:
    if p["name"].startswith(("TEST_", "QA ")) and p.get("stock", 0) == 0:
        s.delete(f"{BASE}/products/{p['id']}", timeout=30)
        removed += 1
print("deactivated", removed)
