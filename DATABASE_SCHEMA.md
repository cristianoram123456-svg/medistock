# Database Schema — MediStock Pro (MongoDB)

Multi-tenant: **every** document carries `business_id`. All ids are UUID strings (`id`), avoiding ObjectId serialization issues. A single business currently maps to one store; `store_id` can be layered on for multi-store later.

## Collections

### businesses
`id, owner_id, name, owner_name, mobile, email, gstin, drug_license, address, state, pincode, logo, signature, gst_registered, invoice_prefix, invoice_counter, settings{low_stock_default, expiry_alert_days, round_off, financial_year}, created_at`

### users
`id, name, email(unique), password_hash(bcrypt), role(owner|admin|pharmacist|cashier|inventory), business_id, active, created_at`

### products
`id, business_id, name, brand, generic, composition, strength, dosage_form, manufacturer, marketing_company, category, schedule, prescription_required, hsn, gst_rate, barcode, sku, pack_size, unit, mrp, purchase_rate, landing_rate, selling_rate, min_selling_rate, profit_margin, min_stock, reorder_level, rack, storage, image, substitutes, preferred_supplier, active, created_at`

### product_batches  (real-time stock lives here, per batch)
`id, business_id, product_id, batch_number, mfg_date, expiry_date, purchase_qty, free_qty, available_qty, mrp, purchase_rate, discount, gst, landing_cost, selling_price, profit, profit_pct, supplier_id, purchase_no, purchase_date, created_at`

### customers
`id, business_id, name, phone, email, address, gstin, credit_limit, opening_balance, balance, notes, created_at`

### suppliers
`id, business_id, name, contact_person, phone, email, address, gstin, drug_license, payment_terms, opening_balance, balance, notes, created_at`

### sales  /  sale_items
sales: `id, business_id, invoice_no, customer_id, customer_name, doctor_name, prescription_ref, date, subtotal, total_tax, cgst, sgst, igst, bill_discount, round_off, grand_total, paid_amount, balance, payment_method, invoice_format, gst_invoice, profit, status(completed|cancelled), idempotency_key, user_id, created_at`
sale_items: `id, business_id, sale_id, product_id, product_name, batch_id, batch_number, expiry_date, hsn, qty, mrp, rate, discount_pct, discount, gst_rate, taxable, tax, cgst, sgst, igst, total, cost, profit`

### purchases / purchase_items
purchases: `id, business_id, purchase_no, supplier_id, supplier_name, supplier_invoice_no, invoice_date, due_date, date, grand_total, paid_amount, balance, payment_method, user_id, created_at`
purchase_items: `id, business_id, purchase_id, product_id, batch_id, batch_number, qty, free_qty, mrp, purchase_rate, discount, gst_rate, landing_cost, total`

### sales_returns / purchase_returns
sales_returns: `id, business_id, return_no, sale_id, invoice_no, customer_id, reason, items[], refund_amount, restock, date, user_id, created_at`
purchase_returns: `id, business_id, return_no, supplier_id, supplier_name, product_id, product_name, batch_id, batch_number, qty, reason, value, date, user_id, created_at`

### stock_movements  (append-only stock ledger)
`id, business_id, product_id, batch_id, type(purchase|sale|sales_return|purchase_return|adjustment|damaged|expired|cancel), qty(+/-), reason, reference, balance, user_id, created_at`

### customer_ledger / supplier_ledger
`id, business_id, customer_id|supplier_id, date, reference, description, debit, credit, balance, created_at`

### payments
`id, business_id, party_type(customer|supplier), party_id, amount, method, note, reference, date, user_id, created_at`

### expenses
`id, business_id, date, category, amount, method, description, receipt, user_id, created_at`

### audit_logs
`id, business_id, user_id, user_name, action, record, old_value, new_value, created_at`

## Indexes
- `users.email` unique; `users.business_id`
- `products (business_id, name)`, `products (business_id, barcode)`
- `product_batches (business_id, product_id)`, `product_batches (business_id, expiry_date)`
- `sales (business_id, date)`
- `customer_ledger.customer_id`, `supplier_ledger.supplier_id`

## Transaction safety
Sale finalization validates all batches (stock + not expired) **before** any mutation, then writes invoice → sale_items → batch decrements → stock_movements → ledger → payment. `idempotency_key` prevents double submission. Invoice numbers come from an atomic `$inc` on `businesses.invoice_counter`.
