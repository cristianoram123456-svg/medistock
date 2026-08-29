import { Loader2 } from "lucide-react";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = "default", testid }) {
  const tones = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-500",
    danger: "text-red-600",
  };
  return (
    <div className="bg-background border rounded-lg p-4 h-full" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wide uppercase text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${tones[tone]}`} />}
      </div>
      <div className={`font-display font-extrabold text-2xl mt-2 tabular ${tones[tone]}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function Empty({ title = "Nothing here yet", sub }) {
  return (
    <div className="text-center py-16 border rounded-lg bg-background">
      <div className="font-display font-bold text-lg">{title}</div>
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
