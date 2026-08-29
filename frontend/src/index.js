import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Prevent dev-overlay crashes from unhandled axios rejections (network/HTTP errors).
// Handled errors still surface via toasts in their component catch blocks.
window.addEventListener(
  "unhandledrejection",
  (e) => {
    const r = e.reason;
    if (r && (r.isAxiosError || r.config || r.name === "AxiosError")) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
