import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Pill, Loader2 } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const d = await login(form.email, form.password);
        toast.success("Welcome back!");
        navigate(d.user.business_id ? "/" : "/setup");
      } else {
        const d = await register(form.name, form.email, form.password);
        toast.success("Account created");
        navigate("/setup");
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[#0A0A0A] text-white p-12">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-md bg-primary grid place-items-center font-display font-extrabold text-xl">
            M
          </div>
          <div>
            <div className="font-display font-extrabold text-2xl">MediStock Pro</div>
            <div className="text-xs tracking-[0.25em] text-white/50 uppercase">
              Pharmacy Management
            </div>
          </div>
        </div>
        <div>
          <h1 className="font-display font-extrabold text-5xl leading-[1.05] tracking-tight">
            Run your pharmacy
            <br />
            like a <span className="text-primary">pro.</span>
          </h1>
          <p className="mt-6 text-white/60 max-w-md text-base">
            Batch-level inventory, GST billing, FEFO stock rotation, Udhar Khata,
            purchase imports and real-time analytics — built for Indian medical stores.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-white/50">
          <div><span className="font-display font-bold text-white text-xl">FEFO</span><br/>Expiry-first billing</div>
          <div><span className="font-display font-bold text-white text-xl">GST</span><br/>Ready invoices</div>
          <div><span className="font-display font-bold text-white text-xl">Cloud</span><br/>Multi-device sync</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 bg-secondary/40">
        <form
          onSubmit={submit}
          className="w-full max-w-sm bg-background border rounded-lg p-8"
          data-testid="auth-form"
        >
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <Pill className="h-6 w-6 text-primary" />
            <span className="font-display font-extrabold text-xl">MediStock Pro</span>
          </div>
          <h2 className="font-display font-extrabold text-2xl">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            {mode === "login"
              ? "Enter your credentials to continue"
              : "First account becomes the business Owner"}
          </p>

          {mode === "register" && (
            <div className="mb-4">
              <Label>Full Name</Label>
              <Input
                data-testid="name-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="mt-1"
              />
            </div>
          )}
          <div className="mb-4">
            <Label>Email</Label>
            <Input
              type="email"
              data-testid="email-input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="mt-1"
            />
          </div>
          <div className="mb-6">
            <Label>Password</Label>
            <Input
              type="password"
              data-testid="password-input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="mt-1"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            data-testid="submit-btn"
            className="w-full"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            data-testid="toggle-mode"
            className="w-full text-sm text-muted-foreground mt-4 hover:text-primary"
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>

          {mode === "login" && (
            <div className="mt-6 text-xs bg-accent text-accent-foreground rounded-md p-3">
              <div className="font-semibold mb-1">Demo Owner login</div>
              cristianoram123456@gmail.com / medistock123
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
