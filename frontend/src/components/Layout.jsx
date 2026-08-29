import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Pill, Users, Truck,
  BookText, Receipt, BarChart3, Settings as SettingsIcon, CalendarClock,
  LogOut, Menu, ShieldCheck, RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, mod: "dashboard" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, mod: "pos" },
  { to: "/sales", label: "Sales & Returns", icon: RotateCcw, mod: "sales" },
  { to: "/purchases", label: "Purchases", icon: Package, mod: "purchases" },
  { to: "/inventory", label: "Inventory", icon: Boxes, mod: "inventory" },
  { to: "/products", label: "Products", icon: Pill, mod: "products" },
  { to: "/expiry", label: "Expiry", icon: CalendarClock, mod: "expiry" },
  { to: "/customers", label: "Customers", icon: Users, mod: "customers" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, mod: "suppliers" },
  { to: "/udhar", label: "Udhar Khata", icon: BookText, mod: "udhar" },
  { to: "/expenses", label: "Expenses", icon: Receipt, mod: "expenses" },
  { to: "/reports", label: "Reports", icon: BarChart3, mod: "reports" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, mod: "settings" },
];

const MOBILE = [
  { to: "/", label: "Home", icon: LayoutDashboard, mod: "dashboard" },
  { to: "/pos", label: "Billing", icon: ShoppingCart, mod: "pos" },
  { to: "/inventory", label: "Stock", icon: Boxes, mod: "inventory" },
  { to: "/purchases", label: "Purchase", icon: Package, mod: "purchases" },
];

export default function Layout({ children }) {
  const { user, business, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = NAV.filter((n) => can(n.mod));

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-secondary/40 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0A0A0A] text-white flex-col transition-transform lg:translate-x-0 lg:flex ${
          open ? "flex translate-x-0" : "hidden -translate-x-full lg:flex"
        }`}
        data-testid="sidebar"
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-white/10">
          <div className="h-9 w-9 rounded-md bg-primary grid place-items-center font-display font-extrabold">
            M
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-lg">MediStock</div>
            <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">Pro</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              data-testid={`nav-${n.mod}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`
              }
              end={n.to === "/"}
            >
              <n.icon className="h-[18px] w-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 py-2 text-sm">
            <div className="h-8 w-8 rounded-full bg-primary/30 grid place-items-center text-xs font-semibold uppercase">
              {user?.name?.[0] || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{user?.name}</div>
              <div className="text-[11px] text-white/50 capitalize flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> {user?.role}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={doLogout}
            data-testid="logout-btn"
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 mt-1"
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 bg-background border-b flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
          <button
            className="lg:hidden"
            onClick={() => setOpen(true)}
            data-testid="menu-toggle"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <div className="font-display font-bold text-base truncate">
              {business?.name || "MediStock Pro"}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {business?.gst_registered ? "GST Registered" : "Non-GST"} ·{" "}
              {business?.state || "—"}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-background border-t grid grid-cols-5 lg:hidden">
        {MOBILE.filter((n) => can(n.mod)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            data-testid={`mnav-${n.mod}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 text-[11px] gap-0.5 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          data-testid="mnav-more"
          className="flex flex-col items-center justify-center py-2 text-[11px] gap-0.5 text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
}
