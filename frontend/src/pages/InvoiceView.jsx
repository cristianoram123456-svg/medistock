import { inr, fmtDate } from "../lib/format";
import { Button } from "../components/ui/button";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function InvoiceView({ sale, onBack, backLabel = "Back" }) {
  const b = sale.business || {};
  const share = () => {
    const text = `Invoice ${sale.invoice_no}\n${b.name}\nTotal: ${inr(sale.grand_total)}\nDate: ${fmtDate(sale.date)}`;
    if (navigator.share) navigator.share({ title: sale.invoice_no, text }).catch(() => {});
    else {
      navigator.clipboard.writeText(text);
      toast.success("Invoice summary copied");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 no-print">
        <Button variant="outline" onClick={onBack} data-testid="invoice-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> {backLabel}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={share} data-testid="invoice-share">
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
          <Button onClick={() => window.print()} data-testid="invoice-print">
            <Printer className="h-4 w-4 mr-2" /> Print / PDF
          </Button>
        </div>
      </div>

      <div id="print-area" className="bg-white text-black max-w-3xl mx-auto border rounded-lg p-8">
        <div className="flex justify-between items-start border-b-2 border-black pb-4">
          <div>
            <div className="font-display font-extrabold text-2xl">{b.name}</div>
            <div className="text-sm">{b.address}</div>
            <div className="text-sm">{b.state} - {b.pincode} · {b.mobile}</div>
            {b.gstin && <div className="text-sm">GSTIN: {b.gstin}</div>}
            {b.drug_license && <div className="text-sm">DL No: {b.drug_license}</div>}
          </div>
          <div className="text-right">
            <div className="font-display font-bold text-lg">
              {sale.gst_invoice ? "TAX INVOICE" : "INVOICE"}
            </div>
            <div className="text-sm mt-1">No: <b>{sale.invoice_no}</b></div>
            <div className="text-sm">Date: {fmtDate(sale.date)}</div>
            {sale.status === "cancelled" && (
              <div className="text-red-600 font-bold mt-1">CANCELLED</div>
            )}
          </div>
        </div>

        <div className="flex justify-between py-3 text-sm">
          <div>
            <div className="text-xs uppercase text-gray-500">Bill To</div>
            <div className="font-semibold">{sale.customer_name}</div>
            {sale.doctor_name && <div>Dr. {sale.doctor_name}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-gray-500">Payment</div>
            <div className="capitalize font-semibold">{sale.payment_method}</div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-xs uppercase">
              <th className="text-left p-2 border">#</th>
              <th className="text-left p-2 border">Item</th>
              <th className="text-left p-2 border">Batch</th>
              <th className="text-left p-2 border">Exp</th>
              <th className="text-right p-2 border">Qty</th>
              <th className="text-right p-2 border">Rate</th>
              <th className="text-right p-2 border">GST</th>
              <th className="text-right p-2 border">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((it, i) => (
              <tr key={it.id || i}>
                <td className="p-2 border">{i + 1}</td>
                <td className="p-2 border">{it.product_name}</td>
                <td className="p-2 border">{it.batch_number}</td>
                <td className="p-2 border">{it.expiry_date ? fmtDate(it.expiry_date) : "-"}</td>
                <td className="p-2 border text-right tabular">{it.qty}</td>
                <td className="p-2 border text-right tabular">{inr(it.rate)}</td>
                <td className="p-2 border text-right tabular">{it.gst_rate}%</td>
                <td className="p-2 border text-right tabular">{inr(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-64 text-sm space-y-1">
            <Line label="Subtotal" value={inr(sale.subtotal)} />
            {sale.gst_invoice && (
              <>
                <Line label="CGST" value={inr(sale.cgst)} />
                <Line label="SGST" value={inr(sale.sgst)} />
              </>
            )}
            {sale.bill_discount > 0 && <Line label="Discount" value={"-" + inr(sale.bill_discount)} />}
            <Line label="Round Off" value={inr(sale.round_off)} />
            <div className="flex justify-between font-display font-extrabold text-lg border-t-2 border-black pt-1">
              <span>Total</span>
              <span className="tabular">{inr(sale.grand_total)}</span>
            </div>
            <Line label="Paid" value={inr(sale.paid_amount)} />
            {sale.balance > 0 && <Line label="Balance (Udhar)" value={inr(sale.balance)} />}
          </div>
        </div>

        <div className="flex justify-between items-end mt-10 text-xs text-gray-600">
          <div>Thank you for your visit. Get well soon!</div>
          <div className="text-center">
            <div className="border-t border-black w-40 pt-1">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
