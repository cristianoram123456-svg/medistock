import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { inr, inr0 } from "../lib/format";
import { PageHeader, StatCard, Loading } from "../components/common";
import { Button } from "../components/ui/button";
import {
  IndianRupee, TrendingUp, Package, Users, AlertTriangle, CalendarClock,
  Boxes, Wallet, ShoppingCart, Plus, FileDown,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Line, LineChart, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#002FA7", "#10B981", "#F59E0B", "#8b5cf6", "#EF4444"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const navigate = useNavigate();
  const { can } = useAuth();

  useEffect(() => {
    api.get("/dashboard").then((r) => setStats(r.data));
    api.get("/dashboard/charts").then((r) => setCharts(r.data));
  }, []);

  if (!stats) return <Loading />;

  const actions = [
    { label: "New Sale", icon: ShoppingCart, to: "/pos", mod: "pos" },
    { label: "New Purchase", icon: Package, to: "/purchases", mod: "purchases" },
    { label: "Add Product", icon: Plus, to: "/products", mod: "products" },
    { label: "Add Customer", icon: Users, to: "/customers", mod: "customers" },
    { label: "Record Payment", icon: Wallet, to: "/udhar", mod: "udhar" },
    { label: "Purchase Import", icon: FileDown, to: "/purchases?import=1", mod: "import" },
  ].filter((a) => can(a.mod));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Today's business at a glance">
        <Button data-testid="qa-new-sale" onClick={() => navigate("/pos")}>
          <ShoppingCart className="h-4 w-4 mr-2" /> New Sale
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard testid="stat-sales" label="Today's Sales" value={inr(stats.today_sales)} icon={IndianRupee} tone="primary" sub={`${stats.invoice_count} invoices`} />
        <StatCard testid="stat-profit" label="Today's Profit" value={inr(stats.today_profit)} icon={TrendingUp} tone="success" sub="Gross margin" />
        <StatCard testid="stat-purchases" label="Today's Purchases" value={inr(stats.today_purchases)} icon={Package} />
        <StatCard testid="stat-inventory" label="Inventory Value" value={inr0(stats.inventory_value)} icon={Boxes} sub="At landing cost" />
        <StatCard testid="stat-credit" label="Outstanding Credit" value={inr0(stats.outstanding_credit)} icon={Wallet} tone="warning" sub="Customer udhar" />
        <StatCard testid="stat-payables" label="Supplier Payables" value={inr0(stats.supplier_payables)} icon={Wallet} tone="danger" />
        <StatCard testid="stat-lowstock" label="Low Stock Items" value={stats.low_stock} icon={AlertTriangle} tone="warning" sub={`${stats.out_of_stock} out of stock`} />
        <StatCard testid="stat-expiry" label="Expiring / Expired" value={`${stats.expiring} / ${stats.expired}`} icon={CalendarClock} tone="danger" sub="Within 90 days" />
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            data-testid={`quick-${a.label.replace(/\s+/g, "-").toLowerCase()}`}
            onClick={() => navigate(a.to)}
            className="flex flex-col items-center gap-2 p-3 bg-background border rounded-lg hover:border-primary hover:-translate-y-[1px] transition-transform"
          >
            <a.icon className="h-5 w-5 text-primary" />
            <span className="text-xs text-center font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-background border rounded-lg p-4">
          <div className="font-display font-bold mb-3">Sales vs Purchases (7 days)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => inr0(v)} />
              <Legend />
              <Bar dataKey="sales" name="Sales" fill="#002FA7" radius={[3, 3, 0, 0]} />
              <Bar dataKey="purchases" name="Purchases" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-background border rounded-lg p-4">
          <div className="font-display font-bold mb-3">Payment Modes (30d)</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={charts?.payment_split || []}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
              >
                {(charts?.payment_split || []).map((e, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => inr0(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <div className="bg-background border rounded-lg p-4">
          <div className="font-display font-bold mb-3">Daily Profit Trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={charts?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => inr0(v)} />
              <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-background border rounded-lg p-4">
          <div className="font-display font-bold mb-3">Top Selling Medicines (30d)</div>
          <div className="space-y-2">
            {(charts?.top_products || []).map((p, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-muted-foreground tabular">{i + 1}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular text-muted-foreground">{p.qty} units</span>
                <span className="tabular font-semibold w-24 text-right">{inr0(p.revenue)}</span>
              </div>
            ))}
            {(!charts?.top_products || charts.top_products.length === 0) && (
              <div className="text-sm text-muted-foreground py-6 text-center">No sales data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
