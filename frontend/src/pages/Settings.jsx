import { useEffect, useState } from "react";
import api, { apiError } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { PageHeader, Loading } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Settings() {
  const { can } = useAuth();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Business profile, staff & audit trail" />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="stab-profile">Business Profile</TabsTrigger>
          <TabsTrigger value="staff" data-testid="stab-staff">Staff & Roles</TabsTrigger>
          <TabsTrigger value="audit" data-testid="stab-audit">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="staff"><Staff /></TabsContent>
        <TabsContent value="audit"><Audit /></TabsContent>
      </Tabs>
    </div>
  );
}

function Profile() {
  const { business, reload } = useAuth();
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (business) setF({ ...business }); }, [business]);
  if (!f) return <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/business", {
        name: f.name, owner_name: f.owner_name, mobile: f.mobile, email: f.email,
        gstin: f.gstin, drug_license: f.drug_license, address: f.address,
        state: f.state, pincode: f.pincode, gst_registered: f.gst_registered,
        invoice_prefix: f.invoice_prefix,
      });
      await reload();
      toast.success("Business profile updated");
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-4 bg-background border rounded-lg p-6 grid sm:grid-cols-2 gap-4 max-w-3xl">
      <Fld label="Business Name"><Input data-testid="set-name" value={f.name || ""} onChange={set("name")} /></Fld>
      <Fld label="Owner Name"><Input value={f.owner_name || ""} onChange={set("owner_name")} /></Fld>
      <Fld label="Mobile"><Input value={f.mobile || ""} onChange={set("mobile")} /></Fld>
      <Fld label="Email"><Input value={f.email || ""} onChange={set("email")} /></Fld>
      <Fld label="GSTIN"><Input value={f.gstin || ""} onChange={set("gstin")} /></Fld>
      <Fld label="Drug License"><Input value={f.drug_license || ""} onChange={set("drug_license")} /></Fld>
      <Fld label="Address" full><Input value={f.address || ""} onChange={set("address")} /></Fld>
      <Fld label="State"><Input value={f.state || ""} onChange={set("state")} /></Fld>
      <Fld label="PIN Code"><Input value={f.pincode || ""} onChange={set("pincode")} /></Fld>
      <Fld label="Invoice Prefix"><Input data-testid="set-prefix" value={f.invoice_prefix || ""} onChange={set("invoice_prefix")} /></Fld>
      <div className="flex items-center justify-between border rounded-md px-3 py-2">
        <span className="text-sm">GST Registered</span>
        <Switch data-testid="set-gst" checked={f.gst_registered} onCheckedChange={(v) => setF({ ...f, gst_registered: v })} />
      </div>
      <Button onClick={save} disabled={saving} data-testid="set-save" className="sm:col-span-2">Save Changes</Button>
    </div>
  );
}

function Staff() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "cashier" });
  const load = async () => { try { setList((await api.get("/staff")).data); } catch { setList([]); } };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!f.name || !f.email || !f.password) return toast.error("Fill all fields");
    try {
      await api.post("/staff", f);
      toast.success("Staff added");
      setOpen(false); setF({ name: "", email: "", password: "", role: "cashier" }); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const toggle = async (s) => {
    await api.put(`/staff/${s.id}`, { active: !s.active });
    load();
  };
  if (!list) return <Loading />;
  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3"><Button onClick={() => setOpen(true)} data-testid="add-staff-btn"><Plus className="h-4 w-4 mr-2" /> Add Staff</Button></div>
      <div className="bg-background border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-right p-3">Status</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t" data-testid={`staff-${s.id}`}>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-muted-foreground">{s.email}</td>
                <td className="p-3"><Badge variant="secondary" className="capitalize">{s.role}</Badge></td>
                <td className="p-3 text-right">
                  {s.role === "owner" ? <Badge className="bg-primary">Owner</Badge> :
                   <Switch checked={s.active} onCheckedChange={() => toggle(s)} data-testid={`staff-toggle-${s.id}`} />}
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
            <Fld label="Name"><Input data-testid="staff-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Fld>
            <Fld label="Email"><Input data-testid="staff-email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Fld>
            <Fld label="Password"><Input type="password" data-testid="staff-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Fld>
            <Fld label="Role">
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
                <SelectTrigger data-testid="staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>{["admin", "pharmacist", "cashier", "inventory"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="staff-save">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Audit() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/audit-logs").then((r) => setLogs(r.data)).catch(() => setLogs([])); }, []);
  if (!logs) return <Loading />;
  return (
    <div className="mt-4 bg-background border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Time</th><th className="text-left p-3">User</th><th className="text-left p-3">Action</th><th className="text-left p-3">Record</th></tr></thead>
        <tbody>
          {logs.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No activity yet</td></tr>}
          {logs.map((l) => (
            <tr key={l.id} className="border-t" data-testid={`audit-${l.id}`}>
              <td className="p-3 text-muted-foreground">{fmtDate(l.created_at)}</td>
              <td className="p-3">{l.user_name}</td>
              <td className="p-3"><Badge variant="secondary">{l.action}</Badge></td>
              <td className="p-3 text-muted-foreground">{l.record}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fld({ label, children, full }) {
  return <div className={full ? "sm:col-span-2" : ""}><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
