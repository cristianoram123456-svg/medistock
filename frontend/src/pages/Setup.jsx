import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";

export default function Setup() {
  const { setupBusiness, business } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", owner_name: "", mobile: "", email: "", gstin: "",
    drug_license: "", address: "", state: "Maharashtra", pincode: "",
    gst_registered: true, invoice_prefix: "INV",
  });
  const [loading, setLoading] = useState(false);

  if (business) {
    navigate("/");
    return null;
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setupBusiness(f);
      toast.success("Business set up successfully");
      navigate("/");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/40 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-md bg-primary grid place-items-center text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl">Business Setup</h1>
            <p className="text-sm text-muted-foreground">
              Tell us about your pharmacy to get started
            </p>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="bg-background border rounded-lg p-6 grid sm:grid-cols-2 gap-4"
          data-testid="setup-form"
        >
          <Field label="Business Name *"><Input required data-testid="biz-name" value={f.name} onChange={set("name")} /></Field>
          <Field label="Owner Name"><Input data-testid="biz-owner" value={f.owner_name} onChange={set("owner_name")} /></Field>
          <Field label="Mobile"><Input data-testid="biz-mobile" value={f.mobile} onChange={set("mobile")} /></Field>
          <Field label="Email"><Input data-testid="biz-email" value={f.email} onChange={set("email")} /></Field>
          <Field label="GSTIN"><Input data-testid="biz-gstin" value={f.gstin} onChange={set("gstin")} /></Field>
          <Field label="Drug License No."><Input data-testid="biz-dl" value={f.drug_license} onChange={set("drug_license")} /></Field>
          <Field label="Address" full><Input data-testid="biz-address" value={f.address} onChange={set("address")} /></Field>
          <Field label="State"><Input data-testid="biz-state" value={f.state} onChange={set("state")} /></Field>
          <Field label="PIN Code"><Input data-testid="biz-pin" value={f.pincode} onChange={set("pincode")} /></Field>
          <Field label="Invoice Prefix"><Input data-testid="biz-prefix" value={f.invoice_prefix} onChange={set("invoice_prefix")} /></Field>
          <div className="flex items-center justify-between border rounded-md px-3 py-2 sm:col-span-2">
            <div>
              <div className="text-sm font-medium">GST Registered Business</div>
              <div className="text-xs text-muted-foreground">Enable CGST/SGST on invoices</div>
            </div>
            <Switch
              data-testid="biz-gst-toggle"
              checked={f.gst_registered}
              onCheckedChange={(v) => setF({ ...f, gst_registered: v })}
            />
          </div>
          <Button type="submit" disabled={loading} data-testid="setup-submit" className="sm:col-span-2">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Complete Setup
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
