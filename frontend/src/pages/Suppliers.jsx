import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, BookText, Wallet } from "lucide-react";
import { LedgerDialog, PaymentDialog } from "./Customers";

const BLANK = { name: "", contact_person: "", phone: "", email: "", address: "", gstin: "", drug_license: "", payment_terms: "", opening_balance: 0, notes: "" };

export default function Suppliers() {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/suppliers", { params: { search } });
    setList(data);
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    try {
      if (form.id) await api.put(`/suppliers/${form.id}`, form);
      else await api.post("/suppliers", form);
      toast.success("Supplier saved");
      setForm(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const openLedger = async (s) => setLedger((await api.get(`/suppliers/${s.id}/ledger`)).data);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Distributors, payables & ledgers">
        <Button onClick={() => setForm(BLANK)} data-testid="add-supplier-btn"><Plus className="h-4 w-4 mr-2" /> Add Supplier</Button>
      </PageHeader>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="supplier-search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      {!list ? <Loading /> : list.length === 0 ? <Empty title="No suppliers" /> : (
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Company</th>
                  <th className="text-left p-3">Contact</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-right p-3">Payable</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t" data-testid={`supplier-${s.id}`}>
                    <td className="p-3"><button className="font-medium hover:text-primary" onClick={() => setForm({ ...BLANK, ...s })}>{s.name}</button></td>
                    <td className="p-3 text-muted-foreground">{s.contact_person}</td>
                    <td className="p-3 text-muted-foreground">{s.phone}</td>
                    <td className={`p-3 text-right tabular font-semibold ${s.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{inr(s.balance)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openLedger(s)} data-testid={`sledger-${s.id}`}><BookText className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setPayFor(s)} data-testid={`spay-${s.id}`}><Wallet className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && (
        <Dialog open={!!form} onOpenChange={() => setForm(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-display">{form.id ? "Edit" : "New"} Supplier</DialogTitle></DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <F label="Company Name *"><Input data-testid="sf-name" value={form.name} onChange={set("name")} /></F>
              <F label="Contact Person"><Input value={form.contact_person} onChange={set("contact_person")} /></F>
              <F label="Phone"><Input data-testid="sf-phone" value={form.phone} onChange={set("phone")} /></F>
              <F label="Email"><Input value={form.email} onChange={set("email")} /></F>
              <F label="GSTIN"><Input value={form.gstin} onChange={set("gstin")} /></F>
              <F label="Drug License"><Input value={form.drug_license} onChange={set("drug_license")} /></F>
              <F label="Payment Terms"><Input value={form.payment_terms} onChange={set("payment_terms")} /></F>
              {!form.id && <F label="Opening Balance"><Input type="number" value={form.opening_balance} onChange={set("opening_balance")} /></F>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={save} data-testid="sf-save">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <LedgerDialog data={ledger} onClose={() => setLedger(null)} title="Supplier" />
      <PaymentDialog party={payFor} type="supplier" onClose={() => setPayFor(null)} onDone={load} />
    </div>
  );
}

function F({ label, children }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
