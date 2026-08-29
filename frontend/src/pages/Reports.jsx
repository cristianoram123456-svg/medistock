import { useEffect, useState } from "react";
import api from "../lib/api";
import { inr } from "../lib/format";
import { PageHeader, Loading, StatCard } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { FileDown, IndianRupee, TrendingUp, Boxes, Percent } from "lucide-react";
import { toast } from "sonner";

function toCsv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
function download(name, text) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const monthStart = new Date();
  monthStart.setDate(1);
  const [start, setStart] = useState(monthStart.toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Sales, GST, stock valuation & exports" />
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-background border rounded-lg p-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="rep-start" className="mt-1" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="rep-end" className="mt-1" /></div>
      </div>
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" data-testid="rtab-sales">Sales</TabsTrigger>
          <TabsTrigger value="gst" data-testid="rtab-gst">GST / HSN</TabsTrigger>
          <TabsTrigger value="stock" data-testid="rtab-stock">Stock Valuation</TabsTrigger>
          <TabsTrigger value="export" data-testid="rtab-export">Export / Backup</TabsTrigger>
        </TabsList>
        <TabsContent value="sales"><SalesReport start={start} end={end} /></TabsContent>
        <TabsContent value="gst"><GstReport start={start} end={end} /></TabsContent>
        <TabsContent value="stock"><StockReport /></TabsContent>
        <TabsContent value="export"><ExportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function SalesReport({ start, end }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/reports/sales", { params: { start, end } }).then((r) => setD(r.data)); }, [start, end]);
  if (!d) return <Loading />;
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Invoices" value={d.count} icon={IndianRupee} />
        <StatCard label="Total Sales" value={inr(d.total)} icon={IndianRupee} tone="primary" />
        <StatCard label="Gross Profit" value={inr(d.profit)} icon={TrendingUp} tone="success" />
        <StatCard label="Total GST" value={inr(d.tax)} icon={Percent} tone="warning" />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => download("sales_report.csv", toCsv(d.sales))} data-testid="export-sales"><FileDown className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>
      <div className="bg-background border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground sticky top-0"><tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Date</th><th className="text-right p-3">Total</th><th className="text-right p-3">Profit</th></tr></thead>
            <tbody>{d.sales.map((s) => <tr key={s.id} className="border-t"><td className="p-3 font-medium">{s.invoice_no}</td><td className="p-3">{s.customer_name}</td><td className="p-3">{s.date}</td><td className="p-3 text-right tabular">{inr(s.grand_total)}</td><td className="p-3 text-right tabular text-emerald-600">{inr(s.profit)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GstReport({ start, end }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/reports/gst", { params: { start, end } }).then((r) => setD(r.data)); }, [start, end]);
  if (!d) return <Loading />;
  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3"><Button variant="outline" size="sm" onClick={() => download("gst_hsn.csv", toCsv(d.hsn_summary))} data-testid="export-gst"><FileDown className="h-4 w-4 mr-2" /> Export CSV</Button></div>
      <div className="bg-background border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">HSN</th><th className="text-right p-3">GST %</th><th className="text-right p-3">Taxable</th><th className="text-right p-3">CGST</th><th className="text-right p-3">SGST</th><th className="text-right p-3">Total Tax</th></tr></thead>
          <tbody>
            {d.hsn_summary.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No data in range</td></tr>}
            {d.hsn_summary.map((h, i) => <tr key={i} className="border-t"><td className="p-3 font-medium">{h.hsn}</td><td className="p-3 text-right tabular">{h.gst_rate}%</td><td className="p-3 text-right tabular">{inr(h.taxable)}</td><td className="p-3 text-right tabular">{inr(h.cgst)}</td><td className="p-3 text-right tabular">{inr(h.sgst)}</td><td className="p-3 text-right tabular font-semibold">{inr(h.total_tax)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockReport() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/reports/stock-valuation").then((r) => setD(r.data)); }, []);
  if (!d) return <Loading />;
  return (
    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Batches in Stock" value={d.batch_count} icon={Boxes} />
      <StatCard label="Stock Value (Cost)" value={inr(d.total_cost)} icon={IndianRupee} tone="primary" />
      <StatCard label="Stock Value (MRP)" value={inr(d.total_mrp)} icon={IndianRupee} />
      <StatCard label="Potential Profit" value={inr(d.potential_profit)} icon={TrendingUp} tone="success" />
    </div>
  );
}

function ExportTab() {
  const cols = ["products", "customers", "suppliers", "sales", "purchases", "expenses", "product_batches"];
  const doExport = async (c) => {
    try {
      const { data } = await api.get(`/export/${c}`);
      download(`${c}.csv`, toCsv(data.data));
      toast.success(`Exported ${data.count} ${c}`);
    } catch { toast.error("Export failed"); }
  };
  return (
    <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cols.map((c) => (
        <button key={c} onClick={() => doExport(c)} data-testid={`export-${c}`} className="flex items-center justify-between p-4 bg-background border rounded-lg hover:border-primary transition-colors">
          <span className="font-medium capitalize">{c.replace("_", " ")}</span>
          <FileDown className="h-4 w-4 text-primary" />
        </button>
      ))}
    </div>
  );
}
