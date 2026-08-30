import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { Loading } from "@/components/common";

import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Sales from "@/pages/Sales";
import Purchases from "@/pages/Purchases";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Expiry from "@/pages/Expiry";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import UdharKhata from "@/pages/UdharKhata";
import Expenses from "@/pages/Expenses";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import AdminPortal from "@/pages/AdminPortal";

function Protected({ children }) {
  const { loading, user, business } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!business && loc.pathname !== "/setup") return <Navigate to="/setup" replace />;
  return children;
}

function Shell({ module, children }) {
  const { can } = useAuth();
  return (
    <Protected>
      {module && !can(module) ? <Navigate to="/" replace /> : <Layout>{children}</Layout>}
    </Protected>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter basename={process.env.PUBLIC_URL || "/"}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Protected><Setup /></Protected>} />
            <Route path="/" element={<Shell module="dashboard"><Dashboard /></Shell>} />
            <Route path="/pos" element={<Shell module="pos"><POS /></Shell>} />
            <Route path="/sales" element={<Shell module="sales"><Sales /></Shell>} />
            <Route path="/purchases" element={<Shell module="purchases"><Purchases /></Shell>} />
            <Route path="/inventory" element={<Shell module="inventory"><Inventory /></Shell>} />
            <Route path="/products" element={<Shell module="products"><Products /></Shell>} />
            <Route path="/expiry" element={<Shell module="expiry"><Expiry /></Shell>} />
            <Route path="/customers" element={<Shell module="customers"><Customers /></Shell>} />
            <Route path="/suppliers" element={<Shell module="suppliers"><Suppliers /></Shell>} />
            <Route path="/udhar" element={<Shell module="udhar"><UdharKhata /></Shell>} />
            <Route path="/expenses" element={<Shell module="expenses"><Expenses /></Shell>} />
            <Route path="/reports" element={<Shell module="reports"><Reports /></Shell>} />
            <Route path="/admin" element={<Shell module="settings"><AdminPortal /></Shell>} />
            <Route path="/settings" element={<Shell module="settings"><Settings /></Shell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
