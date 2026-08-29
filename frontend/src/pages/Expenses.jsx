import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader, Loading, Empty, StatCard } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Receipt } from "lucide-react";

const CATS = ["Rent", "Electricity", "Salary", "Internet", "Transport", "Packaging", "Maintenance", "Other"];

export default function Expenses() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), category: "Rent", amount: 0, method: "cash", description: "" });

  const load = useCallback(async () => setList((await api.get("/expenses")).data), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!f.amount || Number(f.amount) <= 0) return toast.error("Enter amount");
    try {
      await api.post("/expenses", { ...f, amount: Number(f.amount) });
      toast.success("Expense recorded");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!list) return <Loading />;
  const total = list.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Track operating costs">
        <Button onClick={() => setOpen(true)} data-testid="add-expense-btn"><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 mb-5 max-w-md">
        <StatCard label="Total Expenses" value={inr(total)} icon={Receipt} tone="danger" testid="expense-total" />
        <StatCard label="Entries" value={list.length} icon={Receipt} />
      </div>
      {list.length === 0 ? <Empty title="No expenses recorded" /> : (
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Method</th>
                  <th className="text-right p-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="border-t" data-testid={`expense-${e.id}`}>
                    <td className="p-3">{fmtDate(e.date)}</td>
                    <td className="p-3 font-medium">{e.category}</td>
                    <td className="p-3 text-muted-foreground">{e.description}</td>
                    <td className="p-3 capitalize text-muted-foreground">{e.method}</td>
                    <td className="p-3 text-right tabular font-semibold">{inr(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">New Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger data-testid="exp-category" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Amount</Label><Input type="number" data-testid="exp-amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="mt-1 tabular" /></div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{["cash", "upi", "card", "bank"].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Description</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="mt-1" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="exp-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
