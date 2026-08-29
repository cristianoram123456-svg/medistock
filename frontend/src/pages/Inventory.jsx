import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { Search, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";

export default function Inventory() {
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Batch-level stock, FEFO & reorder list" />
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock" data-testid="tab-stock">Stock (Batches)</TabsTrigger>
          <TabsTrigger value="reorder" data-testid="tab-reorder">Reorder List</TabsTrigger>
        </TabsList>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="reorder"><ReorderTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function StockTab() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [adjust, setAdjust] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/inventory", { params: { search, limit: 100 } });
    setData(data);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-4">
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="inv-search" placeholder="Search medicines…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      {!data ? <Loading /> : data.items.length === 0 ? <Empty title="No inventory" /> : (
        <div className="bg-background border rounded-lg divide-y">
          {data.items.map((p) => {
            const exp = expanded[p.id];
            return (
              <div key={p.id} data-testid={`inv-row-${p.id}`}>
                <button
                  onClick={() => setExpanded({ ...expanded, [p.id]: !exp })}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/30"
                >
                  {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.generic} · {p.batch_count} batches</div>
                  </div>
                  <div className="text-right">
                    <div className={`tabular font-semibold ${p.stock <= (p.min_stock || 0) ? "text-red-600" : ""}`}>{p.stock} units</div>
                    <div className="text-xs text-muted-foreground tabular">{inr(p.stock_value)}</div>
                  </div>
                </button>
                {exp && (
                  <div className="px-4 pb-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground uppercase">
                        <tr>
                          <th className="text-left p-1.5">Batch</th>
                          <th className="text-left p-1.5">Expiry</th>
                          <th className="text-right p-1.5">Avail</th>
                          <th className="text-right p-1.5">MRP</th>
                          <th className="text-right p-1.5">Landing</th>
                          <th className="text-right p-1.5">Sell</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.batches.map((b) => {
                          const expired = b.expiry_date && b.expiry_date < today;
                          const near = b.expiry_date && !expired && (new Date(b.expiry_date) - new Date()) / 86400000 <= 30;
                          return (
                            <tr key={b.id} className="border-t">
                              <td className="p-1.5 font-medium">{b.batch_number}</td>
                              <td className="p-1.5">
                                {fmtDate(b.expiry_date)}{" "}
                                {expired && <Badge variant="destructive" className="text-[9px] ml-1">Expired</Badge>}
                                {near && <Badge className="text-[9px] ml-1 bg-amber-500">Near</Badge>}
                              </td>
                              <td className="p-1.5 text-right tabular">{b.available_qty}</td>
                              <td className="p-1.5 text-right tabular">{inr(b.mrp)}</td>
                              <td className="p-1.5 text-right tabular">{inr(b.landing_cost)}</td>
                              <td className="p-1.5 text-right tabular">{inr(b.selling_price)}</td>
                              <td className="p-1.5">
                                <button onClick={() => setAdjust({ ...b, product_name: p.name })} data-testid={`adjust-${b.id}`}>
                                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <AdjustDialog batch={adjust} onClose={() => setAdjust(null)} onDone={load} />
    </div>
  );
}

function AdjustDialog({ batch, onClose, onDone }) {
  const [qty, setQty] = useState("");
  const [type, setType] = useState("adjustment");
  const [reason, setReason] = useState("");
  useEffect(() => { setQty(""); setReason(""); setType("adjustment"); }, [batch]);
  if (!batch) return null;

  const save = async () => {
    try {
      await api.post("/inventory/adjust", {
        batch_id: batch.id, qty: Number(qty), type, reason: reason || type,
      });
      toast.success("Stock adjusted");
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Dialog open={!!batch} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Adjust Stock — {batch.product_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Batch {batch.batch_number} · Available {batch.available_qty}</div>
          <div>
            <Label className="text-xs">Type</Label>
            <div className="flex gap-2 mt-1">
              {["adjustment", "damaged", "expired"].map((t) => (
                <Button key={t} type="button" variant={type === t ? "default" : "outline"} size="sm" onClick={() => setType(t)} className="capitalize">{t}</Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Quantity change (use negative to reduce)</Label>
            <Input type="number" data-testid="adjust-qty" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 tabular" placeholder="-5" />
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="adjust-save">Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReorderTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/reorder").then((r) => setRows(r.data)); }, []);
  if (!rows) return <Loading />;
  if (rows.length === 0) return <div className="mt-4"><Empty title="All stocked up" sub="No items below reorder level" /></div>;
  const colors = { out: "destructive", critical: "destructive", low: "secondary" };
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Product</th>
              <th className="text-right p-3">Current</th>
              <th className="text-right p-3">Min</th>
              <th className="text-right p-3">Suggested Order</th>
              <th className="text-center p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" data-testid={`reorder-${r.id}`}>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-right tabular">{r.stock}</td>
                <td className="p-3 text-right tabular">{r.min_stock}</td>
                <td className="p-3 text-right tabular font-semibold">{r.suggested_qty}</td>
                <td className="p-3 text-center"><Badge variant={colors[r.status]} className="capitalize">{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
