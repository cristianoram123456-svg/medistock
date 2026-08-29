# MediStock Pro

Original, production-style **Pharmacy / Medical Store Management Software** for Indian retail pharmacies — billing, batch-level inventory, GST invoicing, Udhar Khata, purchases, returns, expiry management, reports and analytics.

> Built as a real business application: a sale actually reduces the correct batch stock (FEFO), a purchase increases stock, a credit sale updates the customer ledger, a payment reduces outstanding balance, and a purchase on credit updates supplier payables.

## Tech Stack (as delivered)

- **Frontend:** React 19 + React Router + Tailwind + shadcn/ui + Recharts
- **Backend:** FastAPI (Python) with JWT role-based auth
- **Database:** MongoDB (multi-tenant, scoped by `business_id`)

> The problem statement referenced a Firebase + GitHub Pages target. This build runs fully working on the React + FastAPI + MongoDB stack so every workflow is live and testable today. A GitHub Pages hosting guide (`GITHUB_PAGES_SETUP.md`) and a Firebase migration roadmap (`FIREBASE_SETUP.md`) are included.

## Features

- Role-based auth: **Owner, Admin, Pharmacist, Cashier, Inventory Staff**
- Business setup: GSTIN, Drug License, GST/Non-GST toggle, invoice numbering
- Product master (medicines, OTC, surgical, devices, healthcare…)
- **Batch-level inventory** with landing cost, MRP, selling price, profit %
- **FEFO billing** (First-Expiry-First-Out); never sells expired stock; near-expiry warnings
- Fast POS with search (name/brand/generic/composition/barcode), GST breakdown, printable invoice
- GST & Non-GST invoices (CGST/SGST), round-off, A4 print/PDF/share
- Purchases + **CSV Import wizard** (preview → validate → match → import)
- Sales Returns & Purchase Returns (stock + ledger adjustments)
- Customers, Suppliers, **Digital Udhar Khata** ledgers, payment collection
- Expiry dashboard (30/60/90/180 buckets), reorder / low-stock list
- Expenses, cash/bank/UPI tracking
- Dashboard KPIs + charts, Reports (Sales, GST/HSN, Stock Valuation), CSV export
- Audit log, stock movement ledger, atomic-safe sale finalization + idempotency

## Local Development

Services are managed by supervisor.

```bash
# backend  -> http://localhost:8001  (routes prefixed with /api)
# frontend -> http://localhost:3000
sudo supervisorctl restart backend frontend
```

Environment:
- `backend/.env`: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `frontend/.env`: `REACT_APP_BACKEND_URL`

## Demo Login

Demo data (business, staff, products, batches, sales) is auto-seeded on first start.

| Role | Email | Password |
|------|-------|----------|
| Owner | cristianoram123456@gmail.com | medistock123 |
| Admin | admin@medistock.demo | staff123 |
| Cashier | cashier@medistock.demo | staff123 |
| Pharmacist | pharmacist@medistock.demo | staff123 |
| Inventory | inventory@medistock.demo | staff123 |

## Docs

- `GITHUB_PAGES_SETUP.md` — host the frontend on GitHub Pages (sub-path aware)
- `FIREBASE_SETUP.md` — Firebase/Firestore migration roadmap + security rules
- `DATABASE_SCHEMA.md` — collections & fields
- `DEPLOYMENT.md` — production deployment options
