import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { inr } from "../lib/format";
import { PageHeader, Loading, Empty, StatCard } from "../components/common";
import { Button } from "../components/ui/button";
import { BookText, Wallet, IndianRupee, Users } from "lucide-react";
import { LedgerDialog, PaymentDialog } from "./Customers";

export default function UdharKhata() {
  const [list, setList] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/customers");
    setList(data.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!list) return <Loading />;
  const total = list.reduce((s, c) => s + c.balance, 0);

  return (
    <div>
      <PageHeader title="Udhar Khata" subtitle="Digital credit ledger & outstanding collections" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StatCard label="Total Outstanding" value={inr(total)} icon={IndianRupee} tone="danger" testid="udhar-total" />
        <StatCard label="Credit Customers" value={list.length} icon={Users} tone="warning" />
        <StatCard label="Avg. Balance" value={inr(list.length ? total / list.length : 0)} icon={Wallet} />
      </div>
      {list.length === 0 ? <Empty title="No outstanding credit" sub="All customers are settled" /> : (
        <div className="bg-background border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-right p-3">Credit Limit</th>
                  <th className="text-right p-3">Outstanding</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-t" data-testid={`udhar-${c.id}`}>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.phone}</td>
                    <td className="p-3 text-right tabular">{inr(c.credit_limit)}</td>
                    <td className={`p-3 text-right tabular font-semibold ${c.balance > c.credit_limit && c.credit_limit > 0 ? "text-red-600" : "text-amber-600"}`}>{inr(c.balance)}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={async () => setLedger((await api.get(`/customers/${c.id}/ledger`)).data)} data-testid={`uledger-${c.id}`}><BookText className="h-4 w-4" /></Button>
                      <Button size="sm" onClick={() => setPayFor(c)} data-testid={`upay-${c.id}`}><Wallet className="h-4 w-4 mr-1" /> Collect</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <LedgerDialog data={ledger} onClose={() => setLedger(null)} title="Customer" />
      <PaymentDialog party={payFor} type="customer" onClose={() => setPayFor(null)} onDone={load} />
    </div>
  );
}
