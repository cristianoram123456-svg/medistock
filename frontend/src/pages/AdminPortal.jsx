import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Loading, StatCard } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import {
  ShieldCheck, Users, Boxes, Database, AlertTriangle, Plus, FileDown, Upload,
} from "lucide-react";

const ROLES = ["admin", "pharmacist", "cashier", "inventory"];

export default function AdminPortal() {
  return (
    <div>
      <PageHeader title="Admin Control Panel" subtitle="Full software control — staff, settings, data & maintenance">
        <Badge className="bg-primary"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Privileged</Badge>
      </PageHeader>
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview" data-testid="atab-overview">Overview</TabsTrigger>
          <TabsTrigger value="staff" data-testid="atab-staff">Staff & Roles</TabsTrigger>
          <TabsTrigger value="settings" data-testid="atab-settings">Business & Tax</TabsTrigger>
          <TabsTrigger value="medicine" data-testid="atab-medicine">Medicine Database</TabsTrigger>
          <TabsTrigger value="danger" data-testid="atab-danger">Danger Zone</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="staff"><StaffRoles /></TabsContent>
        <TabsContent value="settings"><BusinessTax /></TabsContent>
        <TabsContent value="medicine"><MedicineDb /></TabsContent>
        <TabsContent value="danger"><DangerZone /></TabsContent>
      </Tabs>
    </div>
  );
}

function Overview() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/overview").then((r) => setD(r.data)); }, []);
  if (!d) return <Loading />;
  const c = d.counts;
  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Products" value={c.products} icon={Boxes} tone="primary" testid="ov-products" />
        <StatCard label="Batches" value={c.product_batches} icon={Boxes} />
        <StatCard label="Sales" value={c.sales} icon={Database} />
        <StatCard label="Purchases" value={c.purchases} icon={Database} />
        <StatCard label="Customers" value={c.customers} icon={Users} />
        <StatCard label="Suppliers" value={c.suppliers} icon={Users} />
        <StatCard label="Payments" value={c.payments} icon={Database} />
        <StatCard label="Staff" value={d.staff} icon={ShieldCheck} tone="warning" />
      </div>
      <div className="bg-background border rounded-lg p-4">
        <div className="font-display font-bold mb-3">Role → Permission Matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-2">Role</th><th className="text-left p-2">Accessible Modules</th></tr>
            </thead>
            <tbody>
              {Object.entries(d.permissions_matrix).map(([role, mods]) => (
                <tr key={role} className="border-t">
                  <td className="p-2"><Badge variant="secondary" className="capitalize">{role}</Badge> <span className="text-xs text-muted-foreground ml-1">({d.roles[role] || 0})</span></td>
                  <td className="p-2 text-xs">{mods.includes("*") ? "Everything (full access)" : mods.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StaffRoles() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "cashier" });
  const load = async () => { try { setList((await api.get("/staff")).data); } catch { setList([]); } };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!f.name || !f.email || !f.password) return toast.error("Fill all fields");
    try { await api.post("/staff", f); toast.success("Staff added"); setOpen(false); setF({ name: "", email: "", password: "", role: "cashier" }); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const changeRole = async (s, role) => { await api.put(`/staff/${s.id}`, { role }); toast.success(`${s.name} → ${role}`); load(); };
  const toggle = async (s) => { await api.put(`/staff/${s.id}`, { active: !s.active }); load(); };
  if (!list) return <Loading />;
  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3"><Button onClick={() => setOpen(true)} data-testid="admin-add-staff"><Plus className="h-4 w-4 mr-2" /> Add Staff</Button></div>
      <div className="bg-background border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3 w-44">Role</th><th className="text-right p-3">Active</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t" data-testid={`admin-staff-${s.id}`}>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-muted-foreground">{s.email}</td>
                <td className="p-3">
                  {s.role === "owner" ? <Badge className="bg-primary">Owner</Badge> : (
                    <Select value={s.role} onValueChange={(v) => changeRole(s, v)}>
                      <SelectTrigger data-testid={`role-${s.id}`} className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </td>
                <td className="p-3 text-right">
                  {s.role === "owner" ? <span className="text-xs text-muted-foreground">—</span> :
                   <Switch checked={s.active} onCheckedChange={() => toggle(s)} data-testid={`active-${s.id}`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Add Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input data-testid="as-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Email</Label><Input data-testid="as-email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Password</Label><Input type="password" data-testid="as-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Role</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
                <SelectTrigger data-testid="as-role" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} data-testid="as-save">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BusinessTax() {
  const { business, reload } = useAuth();
  const [f, setF] = useState(null);
  const [s, setS] = useState(null);
  useEffect(() => { if (business) { setF({ ...business }); setS({ ...(business.settings || {}) }); } }, [business]);
  if (!f) return <Loading />;
  const saveBiz = async () => {
    try {
      await api.put("/business", { name: f.name, owner_name: f.owner_name, mobile: f.mobile, email: f.email, gstin: f.gstin, drug_license: f.drug_license, address: f.address, state: f.state, pincode: f.pincode, gst_registered: f.gst_registered, invoice_prefix: f.invoice_prefix });
      await api.put("/business/settings", s);
      await reload();
      toast.success("Business & tax settings saved");
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="mt-4 grid lg:grid-cols-2 gap-4">
      <div className="bg-background border rounded-lg p-5 space-y-3">
        <div className="font-display font-bold">Business Profile</div>
        <Row2 label="Business Name"><Input data-testid="ab-name" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Row2>
        <Row2 label="GSTIN"><Input value={f.gstin || ""} onChange={(e) => setF({ ...f, gstin: e.target.value })} /></Row2>
        <Row2 label="Drug License"><Input value={f.drug_license || ""} onChange={(e) => setF({ ...f, drug_license: e.target.value })} /></Row2>
        <Row2 label="State"><Input value={f.state || ""} onChange={(e) => setF({ ...f, state: e.target.value })} /></Row2>
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <span className="text-sm">GST Registered</span>
          <Switch data-testid="ab-gst" checked={f.gst_registered} onCheckedChange={(v) => setF({ ...f, gst_registered: v })} />
        </div>
      </div>
      <div className="bg-background border rounded-lg p-5 space-y-3">
        <div className="font-display font-bold">Invoice, Tax & Alerts</div>
        <Row2 label="Invoice Prefix"><Input data-testid="ab-prefix" value={f.invoice_prefix || ""} onChange={(e) => setF({ ...f, invoice_prefix: e.target.value })} /></Row2>
        <Row2 label="Financial Year"><Input data-testid="ab-fy" value={s.financial_year || ""} onChange={(e) => setS({ ...s, financial_year: e.target.value })} /></Row2>
        <Row2 label="Low-Stock Default"><Input type="number" value={s.low_stock_default ?? 10} onChange={(e) => setS({ ...s, low_stock_default: Number(e.target.value) })} /></Row2>
        <Row2 label="Expiry Alert (days)"><Input type="number" value={s.expiry_alert_days ?? 90} onChange={(e) => setS({ ...s, expiry_alert_days: Number(e.target.value) })} /></Row2>
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <span className="text-sm">Round-off invoice totals</span>
          <Switch checked={s.round_off ?? true} onCheckedChange={(v) => setS({ ...s, round_off: v })} />
        </div>
        <Button onClick={saveBiz} data-testid="ab-save" className="w-full">Save All Settings</Button>
      </div>
    </div>
  );
}

const MED_SAMPLE = `name,brand,generic,manufacturer,category,hsn,gst_rate,mrp,purchase_rate,selling_rate,min_stock
Calpol 500,Calpol,Paracetamol,GSK,Analgesic,3004,12,28,19,25,15
Shelcal 500,Shelcal,Calcium Carbonate,Torrent,Supplement,3004,12,110,78,100,10`;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const keys = lines[0].split(",").map((k) => k.trim());
  return lines.slice(1).map((ln) => {
    const cells = ln.split(",");
    const o = {};
    keys.forEach((k, i) => {
      const v = (cells[i] || "").trim();
      o[k] = ["gst_rate", "mrp", "purchase_rate", "selling_rate", "min_stock", "reorder_level"].includes(k) ? Number(v || 0) : v;
    });
    return o;
  });
}

function MedicineDb() {
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(false);
  const onFile = async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); };
  const doImport = async () => {
    const rows = parseCsv(csv);
    if (!rows.length) return toast.error("Nothing to import — check CSV format");
    setLoading(true);
    try { const { data } = await api.post("/products/import", { rows }); toast.success(`Imported ${data.created} products`); setCsv(""); }
    catch (e) { toast.error(apiError(e)); }
    finally { setLoading(false); }
  };
  const doExport = async (c) => {
    try {
      const { data } = await api.get(`/export/${c}`);
      const rows = data.data;
      if (!rows.length) return toast.info("No data to export");
      const keys = Object.keys(rows[0]);
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const text = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = `${c}.csv`; a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported ${data.count} ${c}`);
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-accent text-accent-foreground rounded-lg p-4 text-sm">
        <div className="font-semibold mb-1">Bulk Medicine Master Import</div>
        Import a licensed/legally-obtained medicine dataset as CSV. Columns: name, brand, generic, manufacturer, category, hsn, gst_rate, mrp, purchase_rate, selling_rate, min_stock.
        Architecture supports very large catalogs — import in batches. <button className="underline ml-1" onClick={() => setCsv(MED_SAMPLE)} data-testid="med-sample">Load sample</button>
      </div>
      <div className="bg-background border rounded-lg p-4 space-y-3">
        <label className="inline-flex">
          <input type="file" accept=".csv" className="hidden" data-testid="med-file" onChange={onFile} />
          <span className="inline-flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-secondary"><Upload className="h-4 w-4" /> Upload CSV</span>
        </label>
        <Textarea data-testid="med-csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={7} placeholder="…or paste medicine CSV" className="font-mono text-xs" />
        <Button onClick={doImport} disabled={loading} data-testid="med-import">Import Medicines</Button>
      </div>
      <div className="bg-background border rounded-lg p-4">
        <div className="font-display font-bold mb-3">Data Export / Backup</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {["products", "product_batches", "customers", "suppliers", "sales", "purchases", "expenses"].map((c) => (
            <button key={c} onClick={() => doExport(c)} data-testid={`admin-export-${c}`} className="flex items-center justify-between p-3 border rounded-lg hover:border-primary transition-colors">
              <span className="text-sm capitalize">{c.replace("_", " ")}</span><FileDown className="h-4 w-4 text-primary" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DangerZone() {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const isOwner = user?.role === "owner";
  const clear = async () => {
    try { const { data } = await api.post("/admin/clear-transactions"); toast.success(data.message); setConfirm(false); }
    catch (e) { toast.error(apiError(e)); }
  };
  const deactivateZero = async () => {
    try { const { data } = await api.post("/admin/products/deactivate-zero-stock"); toast.success(`Deactivated ${data.deactivated} zero-stock products`); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="mt-4 space-y-4">
      <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
        <div className="font-display font-bold flex items-center gap-2 text-amber-700"><AlertTriangle className="h-5 w-5" /> Maintenance</div>
        <p className="text-sm text-muted-foreground mt-1 mb-3">Deactivate all products that currently have zero stock (they stay in the database, hidden from active lists).</p>
        <Button variant="outline" onClick={deactivateZero} data-testid="dz-deactivate">Deactivate Zero-Stock Products</Button>
      </div>
      <div className="border border-red-300 bg-red-50 rounded-lg p-4">
        <div className="font-display font-bold flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> Reset Transactions</div>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Permanently delete ALL sales, purchases, returns, payments, ledgers, stock movements, expenses and audit logs.
          Products, batches, customers & suppliers are kept; balances reset to opening. This cannot be undone.
          {!isOwner && <span className="block text-red-600 font-medium mt-1">Owner access required.</span>}
        </p>
        <Button variant="destructive" disabled={!isOwner} onClick={() => setConfirm(true)} data-testid="dz-clear">Clear All Transactional Data</Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display text-red-600">Are you absolutely sure?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This wipes all transactional data for your business. Type nothing — just confirm below.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={clear} data-testid="dz-confirm">Yes, clear everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row2({ label, children }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
