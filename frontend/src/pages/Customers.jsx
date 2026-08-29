import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr, fmtDate } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Search, BookText, Wallet } from "lucide-react";

const BLANK = { name: "", phone: "", email: "", address: "", gstin: "", credit_limit: 0, opening_balance: 0, notes: "" };

export default function Customers() {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/customers", { params: { search } });
    setList(data);
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    try {
      if (form.id) await api.put(`/customers/${form.id}`, form);
      else await api.post("/customers", form);
      toast.success("Customer saved");
      setForm(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openLedger = async (c) => {
    const { data } = await api.get(`/customers/${c.id}/ledger`);
    setLedger(data);
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Profiles, credit limits & ledgers">
        <Button onClick={() => setForm(BLANK)} data-testid="add-customer-btn"><Plus className="h-4 w-4 mr-2" /> Add Customer</Button>
      </PageHeader>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="customer-search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      {!list ? <Loading /> : list.length === 0 ? <Empty title="No customers" /> : (
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-right p-3">Credit Limit</th>
                  <th className="text-right p-3">Balance (Udhar)</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-t" data-testid={`customer-${c.id}`}>
                    <td className="p-3">
                      <button className="font-medium hover:text-primary" onClick={() => setForm({ ...BLANK, ...c })}>{c.name}</button>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.phone}</td>
                    <td className="p-3 text-right tabular">{inr(c.credit_limit)}</td>
                    <td className={`p-3 text-right tabular font-semibold ${c.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{inr(c.balance)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openLedger(c)} data-testid={`ledger-${c.id}`}><BookText className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setPayFor(c)} data-testid={`pay-${c.id}`}><Wallet className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FormDialog form={form} setForm={setForm} save={save} />
      <LedgerDialog data={ledger} onClose={() => setLedger(null)} title="Customer" />
      <PaymentDialog party={payFor} type="customer" onClose={() => setPayFor(null)} onDone={load} />
    </div>
  );
}

function FormDialog({ form, setForm, save }) {
  if (!form) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });
  return (
    <Dialog open={!!form} onOpenChange={() => setForm(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">{form.id ? "Edit" : "New"} Customer</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <F label="Name *"><Input data-testid="cf-name" value={form.name} onChange={set("name")} /></F>
          <F label="Phone"><Input data-testid="cf-phone" value={form.phone} onChange={set("phone")} /></F>
          <F label="Email"><Input value={form.email} onChange={set("email")} /></F>
          <F label="GSTIN"><Input value={form.gstin} onChange={set("gstin")} /></F>
          <F label="Address" full><Input value={form.address} onChange={set("address")} /></F>
          <F label="Credit Limit"><Input type="number" value={form.credit_limit} onChange={set("credit_limit")} /></F>
          {!form.id && <F label="Opening Balance"><Input type="number" value={form.opening_balance} onChange={set("opening_balance")} /></F>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          <Button onClick={save} data-testid="cf-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LedgerDialog({ data, onClose, title }) {
  if (!data) return null;
  const party = data.customer || data.supplier;
  return (
    <Dialog open={!!data} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{title} Ledger — {party.name}</DialogTitle></DialogHeader>
        <div className="text-sm mb-2">Current Balance: <b className={party.balance > 0 ? "text-red-600" : "text-emerald-600"}>{inr(party.balance)}</b></div>
        <table className="w-full text-xs">
          <thead className="bg-secondary/60 uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Ref</th>
              <th className="text-left p-2">Description</th>
              <th className="text-right p-2">Debit</th>
              <th className="text-right p-2">Credit</th>
              <th className="text-right p-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No transactions</td></tr>}
            {data.entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{fmtDate(e.date)}</td>
                <td className="p-2">{e.reference}</td>
                <td className="p-2">{e.description}</td>
                <td className="p-2 text-right tabular">{e.debit ? inr(e.debit) : "-"}</td>
                <td className="p-2 text-right tabular">{e.credit ? inr(e.credit) : "-"}</td>
                <td className="p-2 text-right tabular font-medium">{inr(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog({ party, type, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  useEffect(() => { setAmount(""); setMethod("cash"); }, [party]);
  if (!party) return null;
  const save = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Enter amount");
    try {
      await api.post("/payments", { party_type: type, party_id: party.id, amount: Number(amount), method });
      toast.success("Payment recorded");
      onDone(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={!!party} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Record Payment — {party.name}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground mb-1">Outstanding: {inr(party.balance)}</div>
        <div className="space-y-3">
          <div><Label className="text-xs">Amount</Label><Input type="number" data-testid="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 tabular" /></div>
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="pay-method" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{["cash", "upi", "card", "bank", "other"].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="pay-save">Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, full }) {
  return <div className={full ? "sm:col-span-2" : ""}><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
