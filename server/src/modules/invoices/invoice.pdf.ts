import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { Response } from 'express';
import { env } from '../../config/env';
import type { serializeInvoice } from './invoices.service';

type Invoice = ReturnType<typeof serializeInvoice>;

const NAVY = '#1e3a5f';
const GRAY = '#6b7280';
const LIGHT = '#e5e7eb';

const amount = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `PHP ${amount(n)}`;

const VAT_LABEL: Record<string, string> = {
  VAT: 'VAT (12%)',
  VAT_ADD: 'Add VAT (12% on top)',
  ZERO_RATED: 'Zero-Rated',
  VAT_EXEMPT: 'VAT-Exempt',
};

function termsText(inv: Invoice) {
  return inv.termsType === 'NET' ? `Net ${inv.netDays ?? ''} days` : 'COD';
}

// Streams an invoice PDF to the Express response.
export function streamInvoicePdf(inv: Invoice, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  const left = 50;
  const right = 545;
  const company = env.company;

  // ---- Header: logo + company (left), title (right) ----
  let headerBottom = 50;
  const logoPath = company.logoPath ? path.resolve(process.cwd(), company.logoPath) : '';
  let textX = left;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, left, 45, { fit: [60, 60] });
      textX = left + 72;
    } catch {
      /* ignore bad image */
    }
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(company.name, textX, 48, { width: 320 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  let cy = doc.y + 1;
  const companyLines = [company.address, company.tin ? `TIN: ${company.tin}` : '', [company.phone, company.email].filter(Boolean).join('  |  ')].filter(Boolean);
  for (const line of companyLines) {
    doc.text(line, textX, cy, { width: 320 });
    cy = doc.y;
  }
  headerBottom = Math.max(cy, 110);

  // Title block (right)
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('SALES INVOICE', 330, 48, { width: 215, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  doc.text(`Invoice No:  ${inv.number ?? '(DRAFT)'}`, 330, 74, { width: 215, align: 'right' });
  doc.text(`Date:  ${new Date(inv.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`, 330, doc.y, { width: 215, align: 'right' });
  doc.text(`Terms:  ${termsText(inv)}`, 330, doc.y, { width: 215, align: 'right' });

  // Divider
  doc.moveTo(left, headerBottom + 8).lineTo(right, headerBottom + 8).strokeColor(LIGHT).stroke();

  // ---- Bill to ----
  const billY = headerBottom + 18;
  doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9).text('BILL TO', left, billY);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(inv.customerName, left, billY + 12, { width: 300 });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  if (inv.customerTin) doc.text(`TIN: ${inv.customerTin}`, left, doc.y + 1, { width: 300 });
  doc.text(`VAT Classification: ${VAT_LABEL[inv.vatClass]}`, left, doc.y + 1, { width: 300 });
  if (inv.poNumber) doc.text(`PO Number: ${inv.poNumber}`, left, doc.y + 1, { width: 300 });
  if (inv.agent) doc.text(`Agent: ${inv.agent.name}`, left, doc.y + 1, { width: 300 });

  // ---- Items table ----
  const cols = {
    no: { x: left, w: 24 },
    desc: { x: 74, w: 216 },
    qty: { x: 290, w: 50 },
    unit: { x: 340, w: 45 },
    price: { x: 385, w: 75 },
    amount: { x: 460, w: 85 },
  };
  let y = Math.max(doc.y + 14, billY + 70);

  const drawHeader = (yy: number) => {
    doc.rect(left, yy - 4, right - left, 20).fill(NAVY);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', cols.no.x + 3, yy, { width: cols.no.w });
    doc.text('DESCRIPTION', cols.desc.x, yy, { width: cols.desc.w });
    doc.text('QTY', cols.qty.x, yy, { width: cols.qty.w, align: 'right' });
    doc.text('UNIT', cols.unit.x + 4, yy, { width: cols.unit.w });
    doc.text('UNIT PRICE', cols.price.x, yy, { width: cols.price.w, align: 'right' });
    doc.text('AMOUNT', cols.amount.x, yy, { width: cols.amount.w, align: 'right' });
  };
  drawHeader(y);
  y += 22;

  doc.font('Helvetica').fontSize(9).fillColor('#111');
  inv.items.forEach((it, i) => {
    if (y > 720) {
      doc.addPage();
      y = 60;
      drawHeader(y);
      y += 22;
      doc.font('Helvetica').fontSize(9).fillColor('#111');
    }
    const descHeight = doc.heightOfString(it.description, { width: cols.desc.w });
    const rowH = Math.max(16, descHeight + 4);
    doc.fillColor('#111');
    doc.text(String(i + 1), cols.no.x + 3, y, { width: cols.no.w });
    doc.text(it.description, cols.desc.x, y, { width: cols.desc.w });
    doc.text(amount(it.qty), cols.qty.x, y, { width: cols.qty.w, align: 'right' });
    doc.text(it.unit, cols.unit.x + 4, y, { width: cols.unit.w });
    doc.text(amount(it.unitPrice), cols.price.x, y, { width: cols.price.w, align: 'right' });
    doc.text(amount(it.lineTotal), cols.amount.x, y, { width: cols.amount.w, align: 'right' });
    y += rowH;
    doc.moveTo(left, y - 2).lineTo(right, y - 2).strokeColor(LIGHT).stroke();
  });

  // ---- Totals ----
  y += 8;
  const labelX = 360;
  const valX = 460;
  const valW = 85;
  const totalsRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? NAVY : '#111');
    doc.text(label, labelX, y, { width: 95, align: 'right' });
    doc.text(value, valX, y, { width: valW, align: 'right' });
    y += bold ? 18 : 15;
  };

  totalsRow('Subtotal', amount(inv.subtotal));
  if (inv.discount > 0) totalsRow('Discount', `- ${amount(inv.discount)}`);
  if (inv.vatClass === 'VAT') {
    totalsRow('VATable Sales', amount(inv.vatableSales));
    totalsRow(inv.addVat ? 'VAT (12%)' : 'VAT (not added)', amount(inv.vatAmount));
  } else if (inv.vatClass === 'VAT_ADD') {
    totalsRow('VATable Sales', amount(inv.vatableSales));
    totalsRow('VAT (12%)', amount(inv.vatAmount));
  } else if (inv.vatClass === 'ZERO_RATED') {
    totalsRow('Zero-Rated Sales', amount(inv.zeroRatedSales));
  } else {
    totalsRow('VAT-Exempt Sales', amount(inv.vatExemptSales));
  }
  doc.moveTo(labelX, y).lineTo(right, y).strokeColor(LIGHT).stroke();
  y += 4;
  totalsRow('TOTAL DUE', money(inv.total), true);

  // ---- Footer ----
  const footY = 770;
  doc.font('Helvetica').fontSize(8).fillColor(GRAY);
  doc.text(`Status: ${inv.status}   |   Payment: ${inv.paymentStatus}`, left, footY);
  doc.text(`Prepared by: ${inv.createdBy?.fullName ?? '—'}`, left, footY + 11);
  doc.text('This is a system-generated document.', 330, footY + 11, { width: 215, align: 'right' });

  // ---- Watermark for DRAFT / VOID ----
  if (inv.status !== 'FINALIZED') {
    doc.save();
    doc.rotate(-45, { origin: [297, 400] });
    doc.font('Helvetica-Bold').fontSize(110).fillColor(inv.status === 'VOID' ? '#fde2e2' : '#eef1f5');
    doc.text(inv.status, 100, 360, { width: 400, align: 'center' });
    doc.restore();
  }

  doc.end();
}
