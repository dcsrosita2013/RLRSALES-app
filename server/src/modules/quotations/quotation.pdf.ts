import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { env } from '../../config/env';
import { RLR_LOGO_PNG_BASE64 } from '../../lib/logo';
import type { serializeQuotation } from './quotations.service';

type Quotation = ReturnType<typeof serializeQuotation>;

const RLR_LOGO = Buffer.from(RLR_LOGO_PNG_BASE64, 'base64');

const BLUE = '#2f6cb0';
const DARK = '#111111';
const GRAY = '#6b7280';
const RED = '#c0392b';
const LINE = '#9ca3af';

const amount = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : amount(n));
const dateLong = (d: string | Date) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: '2-digit' });

// VAT/VAT_ADD customers are charged 12%; ZERO_RATED / VAT_EXEMPT are 0%.
function vatPercentFor(q: Quotation): number {
  const vc = q.customer?.vatClass ?? 'VAT';
  return vc === 'VAT' || vc === 'VAT_ADD' ? 12 : 0;
}
function paymentTermsText(q: Quotation): string {
  const c = q.customer;
  if (!c) return '0 days';
  return c.termsType === 'NET' ? `${c.netDays ?? 0} days` : 'COD';
}
function validityDays(q: Quotation): number {
  if (q.validUntil) {
    const d = Math.round((new Date(q.validUntil).getTime() - new Date(q.date).getTime()) / 86_400_000);
    if (d > 0) return d;
  }
  return 15;
}

interface Col {
  label: string;
  x: number;
  w: number;
  align: 'left' | 'center' | 'right';
}

export function streamQuotationPdf(q: Quotation, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  const left = 50;
  const right = 545;
  const width = right - left; // 495
  const company = env.company;

  // ---------------- Header: logo (left) + company details (centered beside it) ----------------
  try {
    doc.image(RLR_LOGO, left, 34, { fit: [62, 62] });
  } catch {
    /* ignore logo render failure */
  }
  const hX = left + 72;
  const hW = right - hX;
  doc.fillColor(DARK).font('Times-Bold').fontSize(19).text(company.name, hX, 38, { width: hW, align: 'center' });
  doc.font('Times-Roman').fontSize(9.5).fillColor(DARK);
  if (company.address) doc.text(company.address, hX, doc.y + 2, { width: hW, align: 'center' });
  if (company.telephone) doc.text(`Telephone Nos: ${company.telephone}`, hX, doc.y, { width: hW, align: 'center' });
  if (company.mobile) doc.text(`Mobile Nos: ${company.mobile}`, hX, doc.y, { width: hW, align: 'center' });

  // ---------------- Blue title bar ----------------
  const barY = doc.y + 12;
  doc.rect(left, barY, width, 24).fill(BLUE);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text('PRODUCT QUOTATION', left, barY + 6, { width, align: 'center', characterSpacing: 3 });

  // ---------------- Meta block ----------------
  const labelX = left;
  const valueX = left + 100;
  let y = barY + 24 + 12;
  doc.fontSize(9.5);
  const metaRow = (label: string, value: string, valueColor = DARK) => {
    doc.font('Helvetica-Bold').fillColor(DARK).text(label, labelX, y, { width: valueX - labelX - 4 });
    const h = doc.heightOfString(value || ' ', { width: right - valueX });
    doc.font('Helvetica').fillColor(valueColor).text(value || '', valueX, y, { width: right - valueX });
    y += Math.max(15, h + 3);
  };
  metaRow('Date:', dateLong(q.date));
  metaRow('Company Name:', q.customerName);
  metaRow('Attention:', q.attention || '');
  metaRow('Department:', q.department || '');
  metaRow('Address:', q.customer?.address || '');
  // PR Number (left) + Quotation Number (right) on one line
  doc.font('Helvetica-Bold').fillColor(DARK).text('PR Number:', labelX, y, { width: valueX - labelX - 4 });
  doc.font('Helvetica').fillColor(q.prNumber ? DARK : RED).text(q.prNumber || 'N/A', valueX, y, { width: 150 });
  doc.font('Helvetica-Bold').fillColor(DARK).text('Quotation Number:', 300, y, { width: 110 });
  doc.font('Helvetica').fillColor(DARK).text(q.number, 412, y, { width: right - 412 });
  y += 20;

  // ---------------- Intro ----------------
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK).text('Thank you for your inquiry and we are pleased to submit our offer as follows:', left, y, { width });
  y = doc.y + 6;

  // ---------------- Items table ----------------
  const cols: Col[] = [
    { label: 'Item #', x: left, w: 30, align: 'center' },
    { label: 'Qty', x: left + 30, w: 30, align: 'center' },
    { label: 'UOM', x: left + 60, w: 34, align: 'center' },
    { label: 'Description', x: left + 94, w: 116, align: 'left' },
    { label: 'Brand', x: left + 210, w: 64, align: 'left' },
    { label: 'Availability', x: left + 274, w: 71, align: 'left' },
    { label: 'Unit Price PHP', x: left + 345, w: 75, align: 'right' },
    { label: 'Total PHP', x: left + 420, w: 75, align: 'right' },
  ];
  const priceX = cols[6].x;
  const totalX = cols[7].x;
  const cell = (text: string, c: Col, yy: number) => {
    if (c.align === 'left') doc.text(text, c.x + 4, yy, { width: c.w - 6, align: 'left' });
    else if (c.align === 'right') doc.text(text, c.x, yy, { width: c.w - 5, align: 'right' });
    else doc.text(text, c.x, yy, { width: c.w, align: 'center' });
  };

  const tableTop = y;
  const headerH = 22;
  // header band
  doc.rect(left, tableTop, width, headerH).fill(BLUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  for (const c of cols) doc.text(c.label, c.x, tableTop + 7, { width: c.w, align: 'center' });

  let ty = tableTop + headerH;
  const hLines: number[] = [];
  doc.font('Helvetica').fontSize(8.5).fillColor(DARK);
  q.items.forEach((it, i) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK);
    const descH = doc.heightOfString(it.description || '', { width: cols[3].w - 6 });
    const rowH = Math.max(15, descH + 5);
    cell(String(i + 1), cols[0], ty + 4);
    cell(qtyText(it.qty), cols[1], ty + 4);
    cell((it.unit || '').toUpperCase(), cols[2], ty + 4);
    cell(it.description || '', cols[3], ty + 4);
    cell(it.brand || '', cols[4], ty + 4);
    cell('Available', cols[5], ty + 4);
    cell(amount(it.unitPrice), cols[6], ty + 4);
    cell(amount(it.lineTotal), cols[7], ty + 4);
    ty += rowH;
    hLines.push(ty);
  });
  // pad with empty rows so the table keeps a consistent height
  const minRows = 8;
  for (let i = q.items.length; i < minRows; i++) {
    ty += 16;
    hLines.push(ty);
  }
  const itemsBottom = ty;

  // ----- summary rows (Add Vat / Grand Total / Note) -----
  const subtotal = q.items.reduce((s, it) => s + it.lineTotal, 0);
  const vatPct = vatPercentFor(q);
  const vatAmt = Math.round(subtotal * vatPct) / 100;
  const grand = subtotal + vatAmt;

  const addVatTop = ty;
  const rowH2 = 16;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK);
  doc.text('Add Vat', cols[5].x + 4, addVatTop + 4, { width: cols[5].w });
  doc.font('Helvetica').text(`${vatPct}%`, priceX, addVatTop + 4, { width: cols[6].w - 5, align: 'right' });
  doc.text(amount(vatAmt), totalX, addVatTop + 4, { width: cols[7].w - 5, align: 'right' });
  ty += rowH2;

  const grandTop = ty;
  const rowH3 = 18;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK);
  doc.text('Grand Total (Vat Inc)', cols[3].x, grandTop + 5, { width: priceX - cols[3].x - 4, align: 'right' });
  doc.text(`PHP ${amount(grand)}`, priceX, grandTop + 5, { width: right - priceX - 5, align: 'right' });
  ty += rowH3;

  const noteTop = ty;
  const rowH4 = 16;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK);
  doc.text('Note: Prices and Availability are subject to change without prior notice.', left, noteTop + 4, { width, align: 'center' });
  ty += rowH4;
  const tableBottom = ty;

  // ----- table borders -----
  doc.lineWidth(0.5).strokeColor(LINE);
  doc.rect(left, tableTop, width, tableBottom - tableTop).stroke(); // outer
  doc.moveTo(left, tableTop + headerH).lineTo(right, tableTop + headerH).stroke(); // under header
  // item-region row separators + bottom of item region
  for (const hy of hLines) doc.moveTo(left, hy).lineTo(right, hy).stroke();
  // item-region column separators (header through last item/empty row)
  for (let i = 0; i < cols.length - 1; i++) {
    const vx = cols[i].x + cols[i].w;
    doc.moveTo(vx, tableTop).lineTo(vx, itemsBottom).stroke();
  }
  // summary row separators
  doc.moveTo(left, addVatTop + rowH2).lineTo(right, addVatTop + rowH2).stroke();
  doc.moveTo(left, grandTop + rowH3).lineTo(right, grandTop + rowH3).stroke();
  // verticals around the value cells on the Add Vat row
  doc.moveTo(priceX, addVatTop).lineTo(priceX, grandTop).stroke();
  doc.moveTo(totalX, addVatTop).lineTo(totalX, addVatTop + rowH2).stroke();
  // vertical splitting label/value on the Grand Total row
  doc.moveTo(priceX, grandTop).lineTo(priceX, grandTop + rowH3).stroke();

  // ---------------- Footer ----------------
  let fy = tableBottom + 24;
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  doc.text('We hope that our offer meets your expectation.', left, fy, { width });
  doc.text('Rest assured that your order will be carried out to your entire satisfaction.', left, doc.y + 1, { width });
  doc.fillColor(RED).text('Prices are automatically approved, no signature required.', left, doc.y + 10, { width });

  fy = doc.y + 12;
  doc.fillColor(DARK).font('Helvetica-Bold').text('Payment Terms: ', left, fy, { continued: true }).font('Helvetica').text(paymentTermsText(q));
  doc.font('Helvetica-Bold').text('Quotation Validity: ', left, doc.y + 1, { continued: true }).font('Helvetica').text(`${validityDays(q)} days`);
  doc
    .font('Helvetica-Bold')
    .text('Delivery Leadtime: ', left, doc.y + 1, { continued: true })
    .font('Helvetica')
    .text('If item/s are on stock, delivery will be in 3-4 days time upon receive of PO.');
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  doc.text('If Ex. Stock Singapore 3-4 weeks delivery upon receive of PO.', left + 84, doc.y + 1);
  doc.text('If Ex. Stock Belgium/France/Italy, 1-2 months delivery upon receive of PO.', left + 84, doc.y);

  if (q.notes) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY).text(`Notes: ${q.notes}`, left, doc.y + 8, { width });
  }

  doc.end();
}
