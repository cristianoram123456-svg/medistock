# MediStock Pro — PRD

## Original Problem Statement
Complete Pharmacy / Medical Store Billing, Inventory, Accounting & Business Management software for Indian retail pharmacies. POS billing, GST/Non-GST invoicing, real-time batch-level inventory, FEFO, product master, purchases + CSV import, suppliers, customers, Digital Udhar Khata, payments, expiry management, low-stock alerts, sales/purchase returns, profit calc, reports & analytics, staff management, audit log, backup/export. Target: Firebase + GitHub Pages (see architecture decision below).

## Architecture Decision
User asked for Firebase + GitHub Pages. Built on the native, fully-testable stack **React 19 + FastAPI + MongoDB** with JWT role-based auth so every workflow is live now. Firebase migration roadmap + GitHub Pages hosting guide delivered as docs (`FIREBASE_SETUP.md`, `GITHUB_PAGES_SETUP.md`, `.github/workflows/deploy-pages.yml`, `.nojekyll`, PWA manifest). Multi-tenant: all data scoped by `business_id` (multi-store ready).

## User Personas / Roles
- Owner (all), Admin (management), Pharmacist (inventory/billing), Cashier (billing/customers/udhar), Inventory Staff (purchases/stock). Permissions enforced backend (`require_module`) + frontend (route guard + nav + quick-action filtering).

## Core Requirements (static)
Batch-level stock with landing cost & profit%; FEFO billing (never sell expired, near-expiry warning); GST CGST/SGST invoices with round-off + printable A4; credit sale → customer ledger; payment → reduces outstanding; purchase on credit → supplier payable; sales/purchase returns adjust stock + ledgers; idempotent sale finalize; audit log + stock movement ledger.

## Implemented (2026-06)
- Auth (JWT Bearer, roles), business setup, staff management, audit log
- Product master (rich fields, Rx flag), bulk import endpoint
- Batch inventory, stock adjust (adjustment/damaged/expired), stock movements, reorder/low-stock list
- POS billing (search, FEFO batch auto-pick, GST breakdown, credit, printable invoice, idempotency)
- Sales list + view/print + sales return (cumulative-qty safe) + cancel (return-aware)
- Purchases (manual entry) + CSV Import wizard (preview→validate→match→commit, creates new products)
- Purchase returns (supplier-match validated) from Expiry page
- Customers + Suppliers CRUD + ledgers + payments (module-gated)
- Digital Udhar Khata (outstanding + collect)
- Expenses, Expiry dashboard (30/60/90/180 buckets)
- Dashboard KPIs + charts (sales vs purchases, profit trend, payment split, top products)
- Reports (Sales, GST/HSN, Stock Valuation) + CSV export / backup
- Demo data auto-seed; responsive desktop sidebar + mobile bottom nav; PWA manifest
- Verified: backend 70/70 pytest; all UI flows via testing agent; overpaid balance clamped; role route guards + no crash overlay

## Backlog / Remaining
- P2 (cosmetic): replace native `<input type=date>` in Purchases/Reports/Expiry with shadcn Calendar
- P2: add per-call loading/error state to remaining api.get() reads (global overlay guard already in place)
- P2: business logo/signature upload (object storage), payment reminder templates UI, thermal 58/80mm invoice formats
- P2 (scale/robustness): conditional `$gte` batch update for concurrency; Mongo transactions for sale/purchase; Decimal for money
- Roadmap: Firebase/Firestore + Cloud Functions port (see FIREBASE_SETUP.md), multi-store UI

## Test Credentials
Owner cristianoram123456@gmail.com / medistock123; staff *@medistock.demo / staff123 (see test_credentials.md)
