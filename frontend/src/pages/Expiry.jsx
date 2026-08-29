import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate, daysColor } from "../lib/format";
import { PageHeader, Loading, Empty, StatCard } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { CalendarClock, AlertTriangle, Undo2, Trash2 } from "lucide-react";

const TABS = [
  { key: "expired", label: "Expired" },
  { key: "d30", label: "≤ 30 days" },
  { key: "d60", label: "≤ 60 days" },
  { key: "d90", label: "≤ 90 days" },
  { key: "d180", label: "≤ 180 days" },
];

export default function Expiry() {
  const [data, setData] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [ret, setRet] = useState(null);

  const load = useCallback(async () => setData((await api.get("/expiry")).data), []);
  useEffect(() => { load(); api.get("/suppliers").then((r) => setSuppliers(r.data)); }, [load]);

  const markExpired = async (b) => {
    try {
      await api.post("/inventory/adjust", { batch_id: b.id, qty: -b.available_qty, type: "expired", reason: "Marked expired" });
      toast.success("Marked as expired & removed from saleable stock");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <Loading />;
  const val = (arr) => arr.reduce((s, b) => s + b.stock_value, 0);

  return (
    <div>
      <PageHeader title="Expiry Management" subtitle="Track and act on expiring & expired batches" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Expired" value={data.expired.length} icon={AlertTriangle} tone="danger" sub={inr(val(data.expired))} testid="exp-expired-count" />
        <StatCard label="≤ 30 days" value={data.d30.length} icon={CalendarClock} tone="danger" sub={inr(val(data.d30))} />
        <StatCard label="≤ 90 days" value={data.d90.length + data.d60.length} icon={CalendarClock} tone="warning" />
        <StatCard label="≤ 180 days" value={data.d180.length} icon={CalendarClock} />
      </div>
      <Tabs defaultValue="expired">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`exptab-${t.key}`}>{t.label} ({data[t.key].length})</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <BucketTable rows={data[t.key]} expired={t.key === "expired"} onMark={markExpired} onReturn={setRet} />
          </TabsContent>
        ))}
      </Tabs>
      <ReturnDialog batch={ret} suppliers={suppliers} onClose={() => setRet(null)} onDone={load} />
    </div>
  );
}

function BucketTable({ rows, expired, onMark, onReturn }) {
  if (!rows.length) return <div className="mt-4"><Empty title="Nothing in this window" /></div>;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Medicine</th>
              <th className="text-left p-3">Batch</th>
              <th className="text-left p-3">Expiry</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">Value</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t" data-testid={`exprow-${b.id}`}>
                <td className="p-3 font-medium">{b.product_name}</td>
                <td className="p-3">{b.batch_number}</td>
                <td className={`p-3 ${daysColor(b.days_left)}`}>{fmtDate(b.expiry_date)} ({b.days_left}d)</td>
                <td className="p-3 text-right tabular">{b.available_qty}</td>
                <td className="p-3 text-right tabular">{inr(b.stock_value)}</td>
                <td className="p-3 text-right space-x-1">
                  <Button variant="outline" size="sm" onClick={() => onReturn(b)} data-testid={`ret-${b.id}`}><Undo2 className="h-3.5 w-3.5 mr-1" /> Return</Button>
                  {expired && <Button variant="destructive" size="sm" onClick={() => onMark(b)} data-testid={`mark-${b.id}`}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remove</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnDialog({ batch, suppliers, onClose, onDone }) {
  const [supplierId, setSupplierId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Expired");
  useEffect(() => { if (batch) { setSupplierId(batch.supplier_id || ""); setQty(String(batch.available_qty)); setReason("Expired"); } }, [batch]);
  if (!batch) return null;
  const save = async () => {
    if (!supplierId) return toast.error("Select supplier");
    try {
      await api.post("/purchase-returns", { supplier_id: supplierId, batch_id: batch.id, qty: Number(qty), reason });
      toast.success("Returned to supplier · stock & ledger updated");
      onDone(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={!!batch} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Return to Supplier — {batch.product_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Batch {batch.batch_number} · Available {batch.available_qty}</div>
          <div>
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="pret-supplier" className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Quantity</Label><Input type="number" data-testid="pret-qty" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 tabular" /></div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{["Expired", "Near Expiry", "Damaged", "Wrong Product", "Excess Stock", "Other"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="pret-save">Confirm Return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
