import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { env } from '../../config/env';
import { RLR_LOGO_PNG_BASE64 } from '../../lib/logo';
import type { serializePO } from './purchase-orders.service';

type PO = ReturnType<typeof serializePO>;

const RLR_LOGO = Buffer.from(RLR_LOGO_PNG_BASE64, 'base64');

const BLUE = '#2f6cb0'; // header bars + table header (matches the printed letterhead)
const DARK = '#111111';
const GRAY = '#6b7280';
const LINE = '#9ca3af'; // table grid lines

const amount = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : amount(n));

function termsText(po: PO): string {
  if (po.termsType === 'NET') return `${po.netDays ?? ''} days`.trim();
  return 'COD';
}

// Decode a base64 data-URL e-signature into a Buffer for pdfkit (returns null if absent/invalid).
function decodeSignature(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const trimmed = dataUrl.trim();
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(trimmed);
  const b64 = match ? match[1] : trimmed;
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

interface Col {
  label: string;
  x: number;
  w: number;
  align: 'left' | 'center' | 'right';
}

export function streamPOPdf(po: PO, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  const left = 50;
  const right = 545;
  const width = right - left; // 495
  const company = env.company;

  // ---------------- Header: logo (left) + company details (centered beside it) ----------------
  try {
    doc.image(RLR_LOGO, left, 36, { fit: [62, 62] });
  } catch {
    /* ignore logo render failure */
  }
  const hX = left + 72;
  const hW = right - hX;
  doc.fillColor(DARK).font('Times-Bold').fontSize(19).text(company.name, hX, 40, { width: hW, align: 'center' });
  doc.font('Times-Roman').fontSize(9.5).fillColor(DARK);
  if (company.address) doc.text(company.address, hX, doc.y + 2, { width: hW, align: 'center' });
  if (company.telephone) doc.text(`Telephone Nos: ${company.telephone}`, hX, doc.y, { width: hW, align: 'center' });
  if (company.mobile) doc.text(`Mobile Nos: ${company.mobile}`, hX, doc.y, { width: hW, align: 'center' });

  // ---------------- Title + meta (right side) ----------------
  const titleY = doc.y + 20;
  const metaX = 320;
  const metaW = right - metaX;
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20).text('PURCHASE ORDER', metaX, titleY, { width: metaW });
  doc.font('Helvetica').fontSize(10).fillColor(DARK);
  const my = doc.y + 4;
  const dateStr = new Date(po.invoiceDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  doc.text(`Date: ${dateStr}`, metaX, my, { width: metaW });
  doc.text(`P.O. Number: ${po.number}`, metaX, doc.y, { width: metaW });
  doc.text(`Payment Terms: ${termsText(po)}`, metaX, doc.y, { width: metaW });

  // ---------------- VENDOR / SHIP TO blocks ----------------
  const blockY = Math.max(doc.y + 16, titleY + 64);
  const gap = 14;
  const colW = (width - gap) / 2;
  const rcol = left + colW + gap;
  const barH = 18;

  doc.rect(left, blockY, colW, barH).fill(BLUE);
  doc.rect(rcol, blockY, colW, barH).fill(BLUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
  doc.text('VENDOR', left + 6, blockY + 4);
  doc.text('SHIP TO', rcol + 6, blockY + 4);

  const detY = blockY + barH + 5;
  // Vendor (supplier)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(po.supplierName, left + 2, detY, { width: colW - 4 });
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  if (po.supplier?.address) doc.text(po.supplier.address, left + 2, doc.y, { width: colW - 4 });
  if (po.supplier?.contactNumber) doc.text(po.supplier.contactNumber, left + 2, doc.y, { width: colW - 4 });
  const vendBottom = doc.y;

  // Ship to (our company)
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(company.name, rcol + 2, detY, { width: colW - 4 });
  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  if (company.address) doc.text(company.address, rcol + 2, doc.y, { width: colW - 4 });
  if (company.telephone) doc.text(company.telephone, rcol + 2, doc.y, { width: colW - 4 });
  const shipBottom = doc.y;

  // ---------------- Line items table ----------------
  const cols: Col[] = [
    { label: 'ITEM', x: left, w: 38, align: 'center' },
    { label: 'QTY', x: left + 38, w: 42, align: 'center' },
    { label: 'UOM', x: left + 80, w: 42, align: 'center' },
    { label: 'DESCRIPTION', x: left + 122, w: 138, align: 'left' },
    { label: 'BRAND', x: left + 260, w: 95, align: 'left' },
    { label: 'UNIT PRICE', x: left + 355, w: 70, align: 'right' },
    { label: 'TOTAL', x: left + 425, w: 70, align: 'right' },
  ];
  const cellText = (text: string, c: Col, yy: number) => {
    const padL = 5;
    const padR = 5;
    if (c.align === 'left') doc.text(text, c.x + padL, yy, { width: c.w - padL, align: 'left' });
    else if (c.align === 'right') doc.text(text, c.x, yy, { width: c.w - padR, align: 'right' });
    else doc.text(text, c.x, yy, { width: c.w, align: 'center' });
  };

  const headH = 20;
  let tableTop = Math.max(vendBottom, shipBottom) + 16;

  const drawHead = (top: number) => {
    doc.rect(left, top, width, headH).fill(BLUE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    for (const c of cols) cellText(c.label, c, top + 6);
  };

  drawHead(tableTop);
  let ty = tableTop + headH;
  const rowLines: number[] = [];

  doc.font('Helvetica').fontSize(9).fillColor(DARK);
  po.items.forEach((it, i) => {
    doc.font('Helvetica').fontSize(9);
    const descH = doc.heightOfString(it.description || '', { width: cols[3].w - 5 });
    const rowH = Math.max(18, descH + 8);

    // page break — close the current grid, then continue on a new page
    if (ty + rowH > 730) {
      drawGrid(doc, left, right, tableTop, ty, headH, cols, rowLines);
      doc.addPage();
      tableTop = 60;
      drawHead(tableTop);
      ty = tableTop + headH;
      rowLines.length = 0;
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
    }

    doc.fillColor(DARK).font('Helvetica').fontSize(9);
    cellText(String(i + 1), cols[0], ty + 5);
    cellText(qtyText(it.qty), cols[1], ty + 5);
    cellText((it.unit || '').toUpperCase(), cols[2], ty + 5);
    cellText(it.description || '', cols[3], ty + 5);
    cellText(it.brand || '', cols[4], ty + 5);
    cellText(amount(it.unitCost), cols[5], ty + 5);
    cellText(amount(it.lineTotal), cols[6], ty + 5);

    ty += rowH;
    rowLines.push(ty);
  });

  // keep a little empty space in the table like the printed form
  const minRows = 4;
  if (po.items.length < minRows) {
    for (let i = po.items.length; i < minRows; i++) {
      ty += 18;
      rowLines.push(ty);
    }
  }

  drawGrid(doc, left, right, tableTop, ty, headH, cols, rowLines);

  // ---------------- Grand total ----------------
  const y = ty + 12;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK);
  doc.text('TOTAL:', cols[5].x - 40, y, { width: cols[5].w + 35, align: 'right' });
  doc.text(amount(po.total), cols[6].x, y, { width: cols[6].w - 5, align: 'right' });

  // ---------------- Footer note + signatories (pinned near the bottom) ----------------
  if (doc.y + 40 > 690) doc.addPage();

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(DARK)
    .text('If you have any question about this Purchase Order, please do not hesitate to call or email us.', left, 695, { width });

  const sigs: { label: string; name: string; title: string; signature: string | null }[] = [
    { label: 'Prepared by:', name: po.createdBy?.fullName || company.signatories.prepared.name, title: company.signatories.prepared.title, signature: po.createdBy?.signature ?? null },
    { label: 'Checked by:', name: company.signatories.checked.name, title: company.signatories.checked.title, signature: null },
    { label: 'Noted by:', name: company.signatories.noted.name, title: company.signatories.noted.title, signature: null },
    {
      label: 'Approved by:',
      name: (po.approvalStatus === 'APPROVED' && po.approvedBy?.fullName) || company.signatories.approved.name,
      title: company.signatories.approved.title,
      signature: null,
    },
  ];
  const sw = width / 4;
  sigs.forEach((s, i) => {
    const sx = left + i * sw;
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(s.label, sx, 722, { width: sw - 8 });
    // e-signature image sits just above the signature line
    const sigBuf = decodeSignature(s.signature);
    if (sigBuf) {
      try {
        doc.image(sigBuf, sx + 2, 728, { fit: [sw - 18, 26], align: 'center', valign: 'bottom' });
      } catch {
        /* ignore unreadable signature image */
      }
    }
    doc.lineWidth(0.7).strokeColor(DARK).moveTo(sx, 756).lineTo(sx + sw - 14, 756).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(s.name || ' ', sx, 759, { width: sw - 14 });
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(s.title || '', sx, doc.y, { width: sw - 14 });
  });

  // Light status watermark for any non-approved copy (printing is normally gated to APPROVED).
  if (po.approvalStatus !== 'APPROVED') {
    doc.save();
    doc.rotate(-45, { origin: [297, 400] });
    doc.font('Helvetica-Bold').fontSize(90).fillColor(po.approvalStatus === 'REJECTED' ? '#fde2e2' : '#eef1f5');
    doc.text(po.approvalStatus, 60, 360, { width: 480, align: 'center' });
    doc.restore();
  }

  doc.end();
}

function drawGrid(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
  tableTop: number,
  bottom: number,
  headH: number,
  cols: Col[],
  rowLines: number[],
) {
  doc.lineWidth(0.5).strokeColor(LINE);
  // outer border
  doc.rect(left, tableTop, right - left, bottom - tableTop).stroke();
  // line under the header band
  doc.moveTo(left, tableTop + headH).lineTo(right, tableTop + headH).stroke();
  // row separators (skip the last — covered by the outer border)
  for (let i = 0; i < rowLines.length - 1; i++) {
    doc.moveTo(left, rowLines[i]).lineTo(right, rowLines[i]).stroke();
  }
  // column separators
  for (let i = 0; i < cols.length - 1; i++) {
    const vx = cols[i].x + cols[i].w;
    doc.moveTo(vx, tableTop).lineTo(vx, bottom).stroke();
  }
}
