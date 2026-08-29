export const inr = (n) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const inr0 = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const fmtDate = (s) => {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
};

export const daysColor = (d) => {
  if (d < 0) return "text-red-600";
  if (d <= 30) return "text-red-500";
  if (d <= 90) return "text-amber-500";
  return "text-emerald-600";
};
