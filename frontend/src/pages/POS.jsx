import { useEffect, useRef, useState } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Search, Trash2, ShoppingCart, AlertTriangle, Loader2, Printer, Plus } from "lucide-react";
import InvoiceView from "./InvoiceView";

export default function POS() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("walkin");
  const [doctor, setDoctor] = useState("");
  const [billDiscount, setBillDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paid, setPaid] = useState("");
  const [placing, setPlacing] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const searchRef = useRef(null);
  const idempotency = useRef(crypto.randomUUID());

  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data));
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 1) return setResults([]);
      const { data } = await api.get("/products", { params: { search: query, limit: 12 } });
      setResults(data.items);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const addProduct = async (p) => {
    const { data } = await api.get(`/products/${p.id}`);
    const today = new Date().toISOString().slice(0, 10);
    const valid = (data.batches || [])
      .filter((b) => b.available_qty > 0 && (!b.expiry_date || b.expiry_date >= today))
      .sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""));
    if (valid.length === 0) {
      toast.error(`No saleable (non-expired) stock for ${p.name}`);
      return;
    }
    const b = valid[0]; // FEFO: nearest expiry
    const exp = b.expiry_date ? Math.ceil((new Date(b.expiry_date) - new Date()) / 86400000) : 999;
    if (exp <= 30) toast.warning(`Near-expiry batch selected (${exp} days left)`);
    setCart((c) => {
      const found = c.find((x) => x.batch_id === b.id);
      if (found)
        return c.map((x) =>
          x.batch_id === b.id ? { ...x, qty: Math.min(x.qty + 1, b.available_qty) } : x
        );
      return [
        ...c,
        {
          product_id: p.id, product_name: p.name, batch_id: b.id,
          batch_number: b.batch_number, expiry_date: b.expiry_date,
          available: b.available_qty, mrp: b.mrp,
          rate: b.selling_price || p.selling_rate, gst_rate: p.gst_rate || 0,
          qty: 1, discount_pct: 0,
          batches: valid,
        },
      ];
    });
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  };

  const updateLine = (i, patch) =>
    setCart((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeLine = (i) => setCart((c) => c.filter((_, idx) => idx !== i));

  const lineTotals = (l) => {
    const gross = l.rate * l.qty;
    const disc = (gross * l.discount_pct) / 100;
    const taxable = gross - disc;
    const tax = (taxable * l.gst_rate) / 100;
    return { gross, disc, taxable, tax, total: taxable + tax };
  };

  const subtotal = cart.reduce((s, l) => s + lineTotals(l).taxable, 0);
  const totalTax = cart.reduce((s, l) => s + lineTotals(l).tax, 0);
  const preRound = subtotal + totalTax - Number(billDiscount || 0);
  const grand = Math.round(preRound);
  const roundOff = grand - preRound;

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setPlacing(true);
    try {
      const payload = {
        customer_id: customerId === "walkin" ? null : customerId,
        doctor_name: doctor,
        items: cart.map((l) => ({
          product_id: l.product_id, batch_id: l.batch_id,
          qty: Number(l.qty), discount_pct: Number(l.discount_pct || 0),
        })),
        bill_discount: Number(billDiscount || 0),
        payment_method: paymentMethod,
        paid_amount: paid === "" ? grand : Number(paid),
        invoice_format: "A4",
        idempotency_key: idempotency.current,
      };
      const { data } = await api.post("/sales", payload);
      const full = await api.get(`/sales/${data.id}`);
      setInvoice(full.data);
      toast.success(`Invoice ${data.invoice_no} created`);
      setCart([]);
      setBillDiscount(0);
      setPaid("");
      setCustomerId("walkin");
      setDoctor("");
      idempotency.current = crypto.randomUUID();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPlacing(false);
    }
  };

  if (invoice)
    return <InvoiceView sale={invoice} onBack={() => setInvoice(null)} backLabel="New Sale" />;

  return (
    <div>
      <PageHeader title="POS / Billing" subtitle="Fast keyboard-first billing with FEFO batch selection" />
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: search + cart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              ref={searchRef}
              data-testid="pos-search"
              placeholder="Search by name, brand, generic, composition or scan barcode…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-80 overflow-y-auto" data-testid="pos-results">
                {results.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`pos-result-${p.id}`}
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center justify-between gap-3 border-b last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.generic} · {p.manufacturer}
                        {p.prescription_required && (
                          <span className="ml-2 text-red-600 font-semibold">℞ Rx</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="tabular font-semibold">{inr(p.selling_rate)}</div>
                      <div className={`text-xs ${p.stock <= 0 ? "text-red-600" : "text-muted-foreground"}`}>
                        Stock: {p.stock}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-background border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 pl-3">Item / Batch</th>
                    <th className="text-right p-2">Rate</th>
                    <th className="text-center p-2 w-24">Qty</th>
                    <th className="text-center p-2 w-20">Disc%</th>
                    <th className="text-center p-2 w-16">GST</th>
                    <th className="text-right p-2 pr-3">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Search and add medicines to start billing
                      </td>
                    </tr>
                  )}
                  {cart.map((l, i) => {
                    const t = lineTotals(l);
                    const exp = l.expiry_date
                      ? Math.ceil((new Date(l.expiry_date) - new Date()) / 86400000)
                      : 999;
                    return (
                      <tr key={i} className="border-t" data-testid={`cart-row-${i}`}>
                        <td className="p-2 pl-3">
                          <div className="font-medium">{l.product_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>Batch {l.batch_number}</span>
                            <span className={exp <= 30 ? "text-red-500 flex items-center gap-0.5" : ""}>
                              {exp <= 30 && <AlertTriangle className="h-3 w-3" />}
                              Exp {fmtDate(l.expiry_date)}
                            </span>
                          </div>
                        </td>
                        <td className="p-2 text-right tabular">{inr(l.rate)}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={1}
                            max={l.available}
                            data-testid={`cart-qty-${i}`}
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(i, {
                                qty: Math.max(1, Math.min(l.available, Number(e.target.value))),
                              })
                            }
                            className="h-8 text-center tabular"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            data-testid={`cart-disc-${i}`}
                            value={l.discount_pct}
                            onChange={(e) => updateLine(i, { discount_pct: Number(e.target.value) })}
                            className="h-8 text-center tabular"
                          />
                        </td>
                        <td className="p-2 text-center tabular text-muted-foreground">{l.gst_rate}%</td>
                        <td className="p-2 pr-3 text-right tabular font-semibold">{inr(t.total)}</td>
                        <td className="p-2">
                          <button data-testid={`cart-remove-${i}`} onClick={() => removeLine(i)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: checkout */}
        <div className="space-y-4">
          <div className="bg-background border rounded-lg p-4 space-y-3">
            <div>
              <Label className="text-xs">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger data-testid="pos-customer" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">Walk-in Customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `· ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Doctor (optional)</Label>
              <Input data-testid="pos-doctor" value={doctor} onChange={(e) => setDoctor(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="bg-background border rounded-lg p-4 space-y-2 text-sm">
            <Row label="Subtotal (taxable)" value={inr(subtotal)} />
            <Row label="Total GST" value={inr(totalTax)} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bill Discount ₹</span>
              <Input
                type="number"
                data-testid="pos-bill-discount"
                value={billDiscount}
                onChange={(e) => setBillDiscount(e.target.value)}
                className="h-8 w-28 text-right tabular"
              />
            </div>
            <Row label="Round Off" value={inr(roundOff)} />
            <div className="flex items-center justify-between border-t pt-2 mt-2">
              <span className="font-display font-bold">Grand Total</span>
              <span className="font-display font-extrabold text-xl tabular text-primary" data-testid="pos-grand-total">
                {inr(grand)}
              </span>
            </div>
          </div>

          <div className="bg-background border rounded-lg p-4 space-y-3">
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="pos-payment" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["cash", "upi", "card", "bank", "credit"].map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount Paid (blank = full)</Label>
              <Input
                type="number"
                data-testid="pos-paid"
                placeholder={String(grand)}
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                className="mt-1 tabular"
              />
              {paid !== "" && Number(paid) < grand && (
                <div className="text-xs text-amber-600 mt-1">
                  Balance {inr(grand - Number(paid))} will be added to customer udhar
                </div>
              )}
            </div>
            <Button
              className="w-full h-11"
              onClick={checkout}
              disabled={placing || cart.length === 0}
              data-testid="pos-checkout"
            >
              {placing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              Complete Sale · {inr(grand)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
