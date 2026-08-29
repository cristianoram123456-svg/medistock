import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = BASE_URL + "/api"


def _creds():
    p = Path("/app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8") if p.exists() else ""
    email = re.search(r'(?im)^\s*[-*]?\s*Email:\s*`?([^`\s]+)', content)
    pwd = re.search(r'(?im)^\s*[-*]?\s*Password:\s*`?([^`\s]+)', content)
    if not email or not pwd:
        pytest.skip("credentials missing")
    return {"email": email.group(1), "password": pwd.group(1)}


@pytest.fixture(scope="session")
def test_credentials():
    return _creds()


@pytest.fixture(scope="session")
def owner(test_credentials):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=test_credentials, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Owner login failed {r.status_code}: {r.text[:300]}")
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def cashier():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login",
               json={"email": "cashier@medistock.demo", "password": "staff123"}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Cashier login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
