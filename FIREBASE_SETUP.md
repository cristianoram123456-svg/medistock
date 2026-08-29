# Firebase Migration Roadmap (Optional Target Architecture)

This app is delivered on **React + FastAPI + MongoDB** (fully working). If you later want the
Firebase-native architecture from the brief (GitHub Pages → Firebase Auth → Firestore →
Cloud Functions → Storage), this document maps the current design onto Firebase 1:1.

> Never put Service Account JSON, Admin private keys, or admin passwords in the frontend bundle.
> Only the public `firebaseConfig` web keys belong in client code.

## 1. Create the project

1. https://console.firebase.google.com → Add project.
2. Enable **Authentication → Email/Password**.
3. Create **Cloud Firestore** (production mode).
4. Enable **Storage**.
5. Web app → copy the `firebaseConfig` (public web keys — safe for frontend).

Store the web config in the frontend env (not secret):
```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_APP_ID=...
```

## 2. Collection mapping

The MongoDB collections in `DATABASE_SCHEMA.md` map directly to Firestore collections.
Do **not** store the whole inventory in one document — keep `products` and `productBatches`
as separate collections (one doc per product / per batch) for scale (400k+ SKUs) and cost control.

Recommended top-level: `businesses`, `users`, `stores`, `products`, `productBatches`,
`customers`, `suppliers`, `sales`, `saleItems`, `purchases`, `purchaseItems`,
`salesReturns`, `purchaseReturns`, `stockMovements`, `customerLedger`, `supplierLedger`,
`expenses`, `payments`, `auditLogs`, `settings`, `notifications`.

## 3. Firestore Security Rules (starter)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function myBiz() { return get(/databases/$(db)/documents/users/$(request.auth.uid)).data.business_id; }
    function myRole() { return get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role; }
    function sameBiz(res) { return res.data.business_id == myBiz(); }
    function isManager() { return myRole() in ['owner','admin']; }

    match /users/{uid} {
      allow read: if signedIn() && (uid == request.auth.uid || resource.data.business_id == myBiz());
      allow write: if signedIn() && isManager();
    }

    // Business-scoped collections
    match /{col}/{docId} {
      allow read:  if signedIn() && sameBiz(resource);
      allow create: if signedIn() && request.resource.data.business_id == myBiz();
      allow update, delete: if signedIn() && sameBiz(resource);
    }
  }
}
```
Never trust `business_id`, price, discount or role sent from the client — enforce with rules
and validate privileged operations in Cloud Functions.

## 4. Storage Rules (starter)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{bizId}/{allPaths=**} {
      allow read, write: if request.auth != null
        && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.business_id == bizId;
    }
  }
}
```

## 5. Cloud Functions (server-authoritative operations)

Move these to Callable Functions so the client can't fabricate stock/price/ledger state:
- `finalizeSale` — validate batch stock + expiry, run a Firestore **transaction**:
  create invoice → saleItems → decrement batch `available_qty` → stockMovement →
  customerLedger (if credit) → payment. Reject expired batches. Enforce FEFO server-side.
- `savePurchase` — create batches, increment stock, update supplier payable.
- `salesReturn` / `purchaseReturn` — adjust stock + ledger atomically.
- `recordPayment` — decrement outstanding balance + ledger entry.
- `nextInvoiceNumber` — transactional counter on the business doc.

The FastAPI handlers in `backend/server.py` are a direct reference implementation for
this business logic — port them into TypeScript Cloud Functions.

## 6. Composite indexes

Create indexes for common queries, e.g.:
- `productBatches`: `business_id ASC, expiry_date ASC` (FEFO + expiry dashboard)
- `sales`: `business_id ASC, date DESC`
- `customerLedger`: `customer_id ASC, created_at ASC`

## 7. Cost control

Paginate lists, cap query limits, avoid loading the full medicine master on startup,
use denormalized summary docs (e.g. a per-business `dashboardStats`) updated by Functions,
and avoid always-on collection listeners.
