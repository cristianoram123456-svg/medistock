import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "../lib/api";
import { inr } from "../lib/format";
import { PageHeader, Loading, Empty } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Pencil, Pill } from "lucide-react";

const BLANK = {
  name: "", brand: "", generic: "", composition: "", strength: "", dosage_form: "Tablet",
  manufacturer: "", category: "Medicine", hsn: "", gst_rate: 12, barcode: "", sku: "",
  pack_size: "10", unit: "strip", mrp: 0, purchase_rate: 0, selling_rate: 0,
  min_stock: 10, reorder_level: 15, rack: "", prescription_required: false, active: true,
};

export default function Products() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/products", { params: { search, limit: 100 } });
    setData(data);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  const openNew = () => { setForm(BLANK); setOpen(true); };
  const openEdit = (p) => { setForm({ ...BLANK, ...p }); setOpen(true); };

  const save = async () => {
    if (!form.name) return toast.error("Product name required");
    setSaving(true);
    try {
      if (form.id) await api.put(`/products/${form.id}`, form);
      else await api.post("/products", form);
      toast.success("Product saved");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Product Master" subtitle="Medicines, OTC, surgical & healthcare products">
        <Button onClick={openNew} data-testid="add-product-btn">
          <Plus className="h-4 w-4 mr-2" /> Add Product
        </Button>
      </PageHeader>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="product-search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty title="No products found" sub="Add your first product to get started" />
      ) : (
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Product</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-right p-3">MRP</th>
                  <th className="text-right p-3">Sell Rate</th>
                  <th className="text-center p-3">GST</th>
                  <th className="text-right p-3">Stock</th>
                  <th className="text-right p-3">Value</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-secondary/30" data-testid={`product-row-${p.id}`}>
                    <td className="p-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.name}
                        {p.prescription_required && <Badge variant="destructive" className="text-[10px]">Rx</Badge>}
                        {!p.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.generic} · {p.manufacturer}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.category}</td>
                    <td className="p-3 text-right tabular">{inr(p.mrp)}</td>
                    <td className="p-3 text-right tabular">{inr(p.selling_rate)}</td>
                    <td className="p-3 text-center tabular">{p.gst_rate}%</td>
                    <td className={`p-3 text-right tabular ${p.stock <= (p.min_stock || 0) ? "text-red-600 font-semibold" : ""}`}>
                      {p.stock}
                    </td>
                    <td className="p-3 text-right tabular text-muted-foreground">{inr(p.stock_value)}</td>
                    <td className="p-3">
                      <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}>
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              {form.id ? "Edit Product" : "New Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Name *"><Input data-testid="pf-name" value={form.name} onChange={set("name")} /></F>
            <F label="Brand"><Input value={form.brand} onChange={set("brand")} /></F>
            <F label="Generic / Salt"><Input value={form.generic} onChange={set("generic")} /></F>
            <F label="Composition"><Input value={form.composition} onChange={set("composition")} /></F>
            <F label="Strength"><Input value={form.strength} onChange={set("strength")} /></F>
            <F label="Dosage Form"><Input value={form.dosage_form} onChange={set("dosage_form")} /></F>
            <F label="Manufacturer"><Input value={form.manufacturer} onChange={set("manufacturer")} /></F>
            <F label="Category"><Input data-testid="pf-category" value={form.category} onChange={set("category")} /></F>
            <F label="HSN Code"><Input value={form.hsn} onChange={set("hsn")} /></F>
            <F label="GST %"><Input type="number" data-testid="pf-gst" value={form.gst_rate} onChange={set("gst_rate")} /></F>
            <F label="Barcode"><Input value={form.barcode} onChange={set("barcode")} /></F>
            <F label="Pack Size"><Input value={form.pack_size} onChange={set("pack_size")} /></F>
            <F label="MRP"><Input type="number" data-testid="pf-mrp" value={form.mrp} onChange={set("mrp")} /></F>
            <F label="Purchase Rate"><Input type="number" value={form.purchase_rate} onChange={set("purchase_rate")} /></F>
            <F label="Selling Rate"><Input type="number" data-testid="pf-sell" value={form.selling_rate} onChange={set("selling_rate")} /></F>
            <F label="Min Stock"><Input type="number" value={form.min_stock} onChange={set("min_stock")} /></F>
            <F label="Reorder Level"><Input type="number" value={form.reorder_level} onChange={set("reorder_level")} /></F>
            <F label="Rack Location"><Input value={form.rack} onChange={set("rack")} /></F>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <span className="text-sm">Prescription (Rx) required</span>
              <Switch checked={form.prescription_required} onCheckedChange={(v) => setForm({ ...form, prescription_required: v })} />
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <span className="text-sm">Active</span>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="pf-save">Save Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, children }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
