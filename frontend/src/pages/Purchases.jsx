import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Upload, FileDown, Loader2, CheckCircle2, XCircle, Camera, FileText, ScanLine } from "lucide-react";

export default function Purchases() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("import") ? "import" : "new");
  return (
    <div>
      <PageHeader title="Purchases" subtitle="Record supplier bills, import CSV & manage stock inflow" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="new" data-testid="tab-new-purchase">New Purchase</TabsTrigger>
          <TabsTrigger value="scan" data-testid="tab-scan-bill">Scan Bill</TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import">CSV Import</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-purchase-history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="new"><NewPurchase onDone={() => setTab("history")} /></TabsContent>
        <TabsContent value="scan"><ScanBill onDone={() => setTab("history")} /></TabsContent>
        <TabsContent value="import"><CsvImport onDone={() => setTab("history")} /></TabsContent>
        <TabsContent value="history"><History /></TabsContent>
      </Tabs>
    </div>
  );
}

function NewPurchase({ onDone }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [invNo, setInvNo] = useState("");
  const [items, setItems] = useState([]);
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/suppliers").then((r) => setSuppliers(r.data));
    api.get("/products", { params: { limit: 200 } }).then((r) => setProducts(r.data.items));
  }, []);

  const addRow = () =>
    setItems([...items, {
      product_id: "", batch_number: "", expiry_date: "", qty: 1, free_qty: 0,
      mrp: 0, purchase_rate: 0, discount_pct: 0, gst_rate: 12, selling_price: 0,
    }]);
  const setRow = (i, patch) => setItems(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const delRow = (i) => setItems(items.filter((_, idx) => idx !== i));

  const lineTotal = (l) => {
    const gross = l.purchase_rate * l.qty;
    const disc = (gross * l.discount_pct) / 100;
    const taxable = gross - disc;
    return taxable + (taxable * l.gst_rate) / 100;
  };
  const grand = items.reduce((s, l) => s + lineTotal(l), 0);

  const save = async () => {
    if (!supplierId) return toast.error("Select a supplier");
    if (items.length === 0 || items.some((i) => !i.product_id || !i.batch_number || !i.expiry_date))
      return toast.error("Complete all item rows (product, batch, expiry)");
    setSaving(true);
    try {
      await api.post("/purchases", {
        supplier_id: supplierId, supplier_invoice_no: invNo,
        items: items.map((i) => ({
          product_id: i.product_id, batch_number: i.batch_number,
          expiry_date: i.expiry_date, qty: Number(i.qty), free_qty: Number(i.free_qty),
          mrp: Number(i.mrp), purchase_rate: Number(i.purchase_rate),
          discount_pct: Number(i.discount_pct), gst_rate: Number(i.gst_rate),
          selling_price: Number(i.selling_price),
        })),
        paid_amount: paid === "" ? 0 : Number(paid),
        payment_method: paid === "" ? "credit" : "cash",
      });
      toast.success("Purchase saved · stock updated");
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-background border rounded-lg p-4 grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger data-testid="pur-supplier" className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Supplier Invoice No.</Label>
          <Input data-testid="pur-invno" value={invNo} onChange={(e) => setInvNo(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Amount Paid (blank = full credit)</Label>
          <Input type="number" data-testid="pur-paid" value={paid} onChange={(e) => setPaid(e.target.value)} className="mt-1 tabular" />
        </div>
      </div>

      <div className="bg-background border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2 min-w-48">Product</th>
                <th className="text-left p-2">Batch</th>
                <th className="text-left p-2">Expiry</th>
                <th className="text-right p-2 w-16">Qty</th>
                <th className="text-right p-2 w-16">Free</th>
                <th className="text-right p-2 w-20">MRP</th>
                <th className="text-right p-2 w-24">Pur.Rate</th>
                <th className="text-right p-2 w-16">GST</th>
                <th className="text-right p-2">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Add item rows below</td></tr>
              )}
              {items.map((l, i) => (
                <tr key={i} className="border-t" data-testid={`pur-row-${i}`}>
                  <td className="p-1.5">
                    <Select value={l.product_id} onValueChange={(v) => {
                      const p = products.find((x) => x.id === v);
                      setRow(i, { product_id: v, mrp: p?.mrp || 0, purchase_rate: p?.purchase_rate || 0, gst_rate: p?.gst_rate || 12, selling_price: p?.selling_rate || 0 });
                    }}>
                      <SelectTrigger data-testid={`pur-prod-${i}`} className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5"><Input data-testid={`pur-batch-${i}`} value={l.batch_number} onChange={(e) => setRow(i, { batch_number: e.target.value })} className="h-8 w-24" /></td>
                  <td className="p-1.5"><Input type="date" data-testid={`pur-exp-${i}`} value={l.expiry_date} onChange={(e) => setRow(i, { expiry_date: e.target.value })} className="h-8 w-36" /></td>
                  <td className="p-1.5"><Input type="number" value={l.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className="h-8 tabular" /></td>
                  <td className="p-1.5"><Input type="number" value={l.free_qty} onChange={(e) => setRow(i, { free_qty: e.target.value })} className="h-8 tabular" /></td>
                  <td className="p-1.5"><Input type="number" value={l.mrp} onChange={(e) => setRow(i, { mrp: e.target.value })} className="h-8 tabular" /></td>
                  <td className="p-1.5"><Input type="number" value={l.purchase_rate} onChange={(e) => setRow(i, { purchase_rate: e.target.value })} className="h-8 tabular" /></td>
                  <td className="p-1.5"><Input type="number" value={l.gst_rate} onChange={(e) => setRow(i, { gst_rate: e.target.value })} className="h-8 tabular" /></td>
                  <td className="p-1.5 text-right tabular font-medium">{inr(lineTotal(l))}</td>
                  <td className="p-1.5"><button onClick={() => delRow(i)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 flex items-center justify-between border-t">
          <Button variant="outline" size="sm" onClick={addRow} data-testid="pur-add-row"><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
          <div className="font-display font-bold">Grand Total: <span className="tabular text-primary">{inr(grand)}</span></div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} data-testid="pur-save" className="w-full sm:w-auto">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Purchase
      </Button>
    </div>
  );
}

const SAMPLE_CSV = `Product,Batch,Expiry,Qty,Free Qty,MRP,Rate,Discount,GST,HSN,Manufacturer
Dolo 650 Tablet,B5001,2027-08-31,100,10,30.50,22,5,12,3004,Micro Labs
New Cough Syrup,C2201,2027-03-31,50,0,85,60,0,12,3004,ABC Pharma`;

function ScanBill({ onDone }) {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [invNo, setInvNo] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { api.get("/suppliers").then((r) => setSuppliers(r.data)); }, []);

  const upload = async () => {
    if (!supplierId) return toast.error("Select a supplier first");
    if (!file) return toast.error("Choose a PDF or photo of the bill");
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("supplier_id", supplierId);
      fd.append("supplier_invoice_no", invNo);
      const { data } = await api.post("/purchases/import/file", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      toast.success(`Purchase ${data.purchase.purchase_no} created from bill · ${data.line_items} items`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-accent text-accent-foreground rounded-lg p-4 text-sm flex gap-2">
        <ScanLine className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold mb-0.5">Scan a supplier bill (OCR)</div>
          Upload a <b>PDF</b> or snap a <b>photo</b> of the bill. Text is read on-device (OCR, no AI),
          line items are extracted and the purchase is <b>created automatically</b>. Since scans vary,
          always open the created purchase in History and verify quantities & rates.
        </div>
      </div>

      <div className="bg-background border rounded-lg p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="scan-supplier" className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Supplier Invoice No.</Label>
            <Input data-testid="scan-invno" value={invNo} onChange={(e) => setInvNo(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-primary transition-colors">
            <input type="file" accept="application/pdf,image/*" className="hidden" data-testid="scan-file-upload"
                   onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <FileText className="h-7 w-7 text-primary" />
            <span className="text-sm font-medium">Upload PDF / Image</span>
            <span className="text-xs text-muted-foreground">from your device</span>
          </label>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-primary transition-colors">
            <input type="file" accept="image/*" capture="environment" className="hidden" data-testid="scan-file-camera"
                   onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Camera className="h-7 w-7 text-primary" />
            <span className="text-sm font-medium">Scan with Camera</span>
            <span className="text-xs text-muted-foreground">take a photo of the bill</span>
          </label>
        </div>

        {file && (
          <div className="text-sm bg-secondary/60 rounded-md px-3 py-2 flex items-center justify-between" data-testid="scan-file-name">
            <span className="truncate">📎 {file.name}</span>
            <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-red-600 text-xs">Remove</button>
          </div>
        )}

        <Button onClick={upload} disabled={loading} data-testid="scan-upload">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}
          Read Bill & Create Purchase
        </Button>
      </div>

      {result && (
        <div className="bg-background border rounded-lg p-4 space-y-3" data-testid="scan-result">
          <div className="flex flex-wrap gap-3 text-sm items-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="font-medium">Created {result.purchase.purchase_no}</span>
            <Badge variant="secondary">Total {inr(result.purchase.grand_total)}</Badge>
            <Badge className="bg-emerald-600">Matched: {result.matched}</Badge>
            <Badge className="bg-amber-500">New: {result.new_products}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">Extracted line items (verify against the physical bill):</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60 uppercase text-muted-foreground">
                <tr><th className="text-left p-2">Product</th><th className="text-left p-2">Batch</th><th className="text-left p-2">Expiry</th><th className="text-right p-2">Qty</th><th className="text-right p-2">MRP</th><th className="text-right p-2">Rate</th></tr>
              </thead>
              <tbody>
                {result.parsed_rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium">{r.product}</td><td className="p-2">{r.batch}</td>
                    <td className="p-2">{r.expiry}</td><td className="p-2 text-right tabular">{r.qty}</td>
                    <td className="p-2 text-right tabular">{r.mrp}</td><td className="p-2 text-right tabular">{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CsvImport({ onDone }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [invNo, setInvNo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/suppliers").then((r) => setSuppliers(r.data)); }, []);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsv(await f.text());
  };

  const doPreview = async () => {
    if (!csv.trim()) return toast.error("Paste or upload CSV first");
    setLoading(true);
    try {
      const { data } = await api.post("/purchases/import/preview", { csv });
      setPreview(data);
    } catch (e) { toast.error(apiError(e)); }
    finally { setLoading(false); }
  };

  const commit = async () => {
    if (!supplierId) return toast.error("Select a supplier");
    setLoading(true);
    try {
      const { data } = await api.post("/purchases/import/commit", {
        supplier_id: supplierId, supplier_invoice_no: invNo, rows: preview.rows,
      });
      toast.success(`Imported ${data.imported} items · stock updated`);
      onDone();
    } catch (e) { toast.error(apiError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-accent text-accent-foreground rounded-lg p-4 text-sm">
        <div className="font-semibold mb-1">CSV Format</div>
        Columns: Product, Batch, Expiry (YYYY-MM-DD), Qty, Free Qty, MRP, Rate, Discount, GST, HSN, Manufacturer.
        Unmatched products are flagged as <b>new</b> and created on import. Rows with errors are skipped.
        <button className="underline ml-1" onClick={() => setCsv(SAMPLE_CSV)} data-testid="load-sample">Load sample</button>
      </div>

      <div className="bg-background border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" data-testid="csv-file" />
            <span className="inline-flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-secondary">
              <Upload className="h-4 w-4" /> Upload CSV
            </span>
          </label>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} download="purchase_template.csv"
             className="inline-flex items-center gap-2 border rounded-md px-3 py-2 text-sm hover:bg-secondary" data-testid="download-template">
            <FileDown className="h-4 w-4" /> Template
          </a>
        </div>
        <Textarea data-testid="csv-text" value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder="…or paste CSV here" className="font-mono text-xs" />
        <Button onClick={doPreview} disabled={loading} data-testid="csv-preview">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Preview & Validate
        </Button>
      </div>

      {preview && (
        <div className="bg-background border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="secondary">Total: {preview.summary.total}</Badge>
            <Badge className="bg-emerald-600">Matched: {preview.summary.matched}</Badge>
            <Badge className="bg-amber-500">New: {preview.summary.new_products}</Badge>
            <Badge variant="destructive">Errors: {preview.summary.errors}</Badge>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60 uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Batch</th>
                  <th className="text-left p-2">Expiry</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Rate</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className="border-t">
                    <td className="p-2">
                      {r.errors.length ? <XCircle className="h-4 w-4 text-red-600" /> :
                       r.is_new ? <Badge className="bg-amber-500 text-[9px]">NEW</Badge> :
                       <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </td>
                    <td className="p-2 font-medium">{r.product}</td>
                    <td className="p-2">{r.batch}</td>
                    <td className="p-2">{r.expiry}</td>
                    <td className="p-2 text-right tabular">{r.qty}</td>
                    <td className="p-2 text-right tabular">{r.rate}</td>
                    <td className="p-2 text-red-600">{r.errors.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="csv-supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Supplier Invoice No." value={invNo} onChange={(e) => setInvNo(e.target.value)} data-testid="csv-invno" />
          </div>
          <Button onClick={commit} disabled={loading} data-testid="csv-commit">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {preview.summary.total - preview.summary.errors} valid rows
          </Button>
        </div>
      )}
    </div>
  );
}

function History() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/purchases", { params: { limit: 100 } }).then((r) => setData(r.data)); }, []);
  if (!data) return <Loading />;
  if (data.items.length === 0) return <div className="mt-4"><Empty title="No purchases yet" /></div>;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Purchase No</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-left p-3">Sup. Invoice</th>
              <th className="text-left p-3">Date</th>
              <th className="text-right p-3">Total</th>
              <th className="text-right p-3">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="border-t" data-testid={`purchase-${p.id}`}>
                <td className="p-3 font-medium">{p.purchase_no}</td>
                <td className="p-3">{p.supplier_name}</td>
                <td className="p-3 text-muted-foreground">{p.supplier_invoice_no || "-"}</td>
                <td className="p-3">{fmtDate(p.date)}</td>
                <td className="p-3 text-right tabular">{inr(p.grand_total)}</td>
                <td className={`p-3 text-right tabular ${p.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{inr(p.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
