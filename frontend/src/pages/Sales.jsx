import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { Eye, Undo2 } from "lucide-react";
import InvoiceView from "./InvoiceView";

export default function Sales() {
  const [viewing, setViewing] = useState(null);
  if (viewing) return <InvoiceView sale={viewing} onBack={() => setViewing(null)} />;
  return (
    <div>
      <PageHeader title="Sales & Returns" subtitle="Invoices, sales returns & purchase returns" />
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" data-testid="tab-sales-list">Sales</TabsTrigger>
          <TabsTrigger value="sreturns" data-testid="tab-sreturns">Sales Returns</TabsTrigger>
          <TabsTrigger value="preturns" data-testid="tab-preturns">Purchase Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="sales"><SalesList onView={setViewing} /></TabsContent>
        <TabsContent value="sreturns"><SalesReturns /></TabsContent>
        <TabsContent value="preturns"><PurchaseReturns /></TabsContent>
      </Tabs>
    </div>
  );
}

function SalesList({ onView }) {
  const [data, setData] = useState(null);
  const [ret, setRet] = useState(null);

  const load = useCallback(async () => setData((await api.get("/sales", { params: { limit: 100 } })).data), []);
  useEffect(() => { load(); }, [load]);

  const view = async (s) => onView((await api.get(`/sales/${s.id}`)).data);
  const openReturn = async (s) => setRet((await api.get(`/sales/${s.id}`)).data);

  if (!data) return <Loading />;
  if (data.items.length === 0) return <div className="mt-4"><Empty title="No sales yet" /></div>;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Payment</th>
              <th className="text-right p-3">Total</th>
              <th className="text-right p-3">Balance</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id} className="border-t" data-testid={`sale-${s.id}`}>
                <td className="p-3 font-medium">{s.invoice_no}{s.status === "cancelled" && <Badge variant="destructive" className="ml-2 text-[9px]">Cancelled</Badge>}</td>
                <td className="p-3">{s.customer_name}</td>
                <td className="p-3">{fmtDate(s.date)}</td>
                <td className="p-3 capitalize text-muted-foreground">{s.payment_method}</td>
                <td className="p-3 text-right tabular">{inr(s.grand_total)}</td>
                <td className={`p-3 text-right tabular ${s.balance > 0 ? "text-red-600" : ""}`}>{inr(s.balance)}</td>
                <td className="p-3 text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => view(s)} data-testid={`view-${s.id}`}><Eye className="h-4 w-4" /></Button>
                  {s.status !== "cancelled" && <Button variant="outline" size="sm" onClick={() => openReturn(s)} data-testid={`return-${s.id}`}><Undo2 className="h-4 w-4" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SalesReturnDialog sale={ret} onClose={() => setRet(null)} onDone={load} />
    </div>
  );
}

function SalesReturnDialog({ sale, onClose, onDone }) {
  const [qtys, setQtys] = useState({});
  const [reason, setReason] = useState("");
  useEffect(() => { setQtys({}); setReason(""); }, [sale]);
  if (!sale) return null;
  const save = async () => {
    const items = Object.entries(qtys).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ sale_item_id: id, qty: Number(q) }));
    if (!items.length) return toast.error("Enter return quantities");
    try {
      await api.post("/sales-returns", { sale_id: sale.id, items, reason, restock: true });
      toast.success("Sales return processed · stock & ledger updated");
      onDone(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={!!sale} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Sales Return — {sale.invoice_no}</DialogTitle></DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground"><tr><th className="text-left p-1.5">Item</th><th className="text-right p-1.5">Sold</th><th className="text-right p-1.5 w-24">Return</th></tr></thead>
          <tbody>
            {sale.items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-1.5">{it.product_name} <span className="text-xs text-muted-foreground">({it.batch_number})</span></td>
                <td className="p-1.5 text-right tabular">{it.qty}</td>
                <td className="p-1.5"><Input type="number" min={0} max={it.qty} data-testid={`ret-qty-${it.id}`} value={qtys[it.id] || ""} onChange={(e) => setQtys({ ...qtys, [it.id]: e.target.value })} className="h-8 tabular" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sret-reason" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="sret-save">Process Return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalesReturns() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/sales-returns").then((r) => setRows(r.data)); }, []);
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="mt-4"><Empty title="No sales returns" /></div>;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Return No</th><th className="text-left p-3">Invoice</th><th className="text-left p-3">Date</th><th className="text-left p-3">Reason</th><th className="text-right p-3">Refund</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="p-3 font-medium">{r.return_no}</td><td className="p-3">{r.invoice_no}</td><td className="p-3">{fmtDate(r.date)}</td><td className="p-3 text-muted-foreground">{r.reason || "-"}</td><td className="p-3 text-right tabular">{inr(r.refund_amount)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function PurchaseReturns() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/purchase-returns").then((r) => setRows(r.data)); }, []);
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="mt-4"><Empty title="No purchase returns" sub="Return expired/damaged stock from the Expiry page" /></div>;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Return No</th><th className="text-left p-3">Supplier</th><th className="text-left p-3">Product</th><th className="text-left p-3">Reason</th><th className="text-right p-3">Qty</th><th className="text-right p-3">Value</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="p-3 font-medium">{r.return_no}</td><td className="p-3">{r.supplier_name}</td><td className="p-3">{r.product_name}</td><td className="p-3 text-muted-foreground">{r.reason}</td><td className="p-3 text-right tabular">{r.qty}</td><td className="p-3 text-right tabular">{inr(r.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
