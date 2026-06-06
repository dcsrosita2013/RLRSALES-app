import type { VatClass, InvoiceStatus, PaymentStatus } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Mirrors the server VAT/totals logic for live form previews.
export function computeInvoiceTotals(
  vatClass: VatClass,
  addVat: boolean,
  discount: number,
  items: { qty: number; unitPrice: number }[],
) {
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0));
  const disc = round2(Math.min(Math.max(discount || 0, 0), subtotal));
  const net = round2(subtotal - disc);

  let vatableSales = 0;
  let zeroRatedSales = 0;
  let vatExemptSales = 0;
  let vatAmount = 0;
  let total = net;

  if (vatClass === 'VAT') {
    vatableSales = net;
    if (addVat) {
      vatAmount = round2(net * 0.12);
      total = round2(net + vatAmount);
    }
  } else if (vatClass === 'VAT_ADD') {
    vatableSales = net;
    vatAmount = round2(net * 0.12);
    total = round2(net + vatAmount);
  } else if (vatClass === 'ZERO_RATED') {
    zeroRatedSales = net;
  } else {
    vatExemptSales = net;
  }
  return { subtotal, discount: disc, net, vatableSales, zeroRatedSales, vatExemptSales, vatAmount, total };
}

export function openPdfInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const STATUS_COLOR: Record<InvoiceStatus, 'gray' | 'green' | 'red'> = {
  DRAFT: 'gray',
  FINALIZED: 'green',
  VOID: 'red',
};

export const PAYMENT_COLOR: Record<PaymentStatus, 'amber' | 'green' | 'blue'> = {
  UNPAID: 'amber',
  PARTIAL: 'blue',
  PAID: 'green',
};
