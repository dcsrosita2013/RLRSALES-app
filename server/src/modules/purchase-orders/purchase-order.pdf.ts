import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { Response } from 'express';
import { env } from '../../config/env';
import type { serializePO } from './purchase-orders.service';

type PO = ReturnType<typeof serializePO>;

const NAVY = '#1e3a5f';
const GRAY = '#6b7280';
const LIGHT = '#e5e7eb';

const amount = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `PHP ${amount(n)}`;

function termsText(po: PO) {
  return po.termsType === 'NET' ? `Net ${po.netDays ?? ''} days` : 'COD';
}

export function streamPOPdf(po: PO, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  const left = 50;
  const right = 545;
  const company = env.company;

  const logoPath = company.logoPath ? path.resolve(process.cwd(), company.logoPath) : '';
  let textX = left;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, left, 45, { fit: [60, 60] });
      textX = left + 72;
    } catch {
      /* ignore */
    }
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(company.name, textX, 48, { width: 320 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  let cy = doc.y + 1;
  for (const line of [company.address, company.tin ? `TIN: ${company.tin}` : '', [company.phone, company.email].filter(Boolean).join('  |  ')].filter(Boolean)) {
    doc.text(line, textX, cy, { width: 320 });
    cy = doc.y;
  }
  const headerBottom = Math.max(cy, 110);

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('PURCHASE ORDER', 330, 48, { width: 215, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  doc.text(`PO No:  ${po.number}`, 330, 74, { width: 215, align: 'right' });
  doc.text(`Date:  ${new Date(po.invoiceDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`, 330, doc.y, { width: 215, align: 'right' });
  doc.text(`Terms:  ${termsText(po)}`, 330, doc.y, { width: 215, align: 'right' });
  doc.text(`Approval:  ${po.approvalStatus}`, 330, doc.y, { width: 215, align: 'right' });

  doc.moveTo(left, headerBottom + 8).lineTo(right, headerBottom + 8).strokeColor(LIGHT).stroke();

  const billY = headerBottom + 18;
  doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9).text('VENDOR / SUPPLIER', left, billY);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(po.supplierName, left, billY + 12, { width: 300 });
  if (po.notes) {
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`Notes: ${po.notes}`, left, doc.y + 2, { width: 320 });
  }

  const cols = {
    no: { x: left, w: 24 },
    desc: { x: 74, w: 226 },
    qty: { x: 300, w: 50 },
    unit: { x: 350, w: 40 },
    cost: { x: 390, w: 70 },
    amount: { x: 460, w: 85 },
  };
  let y = Math.max(doc.y + 16, billY + 60);
  const drawHeader = (yy: number) => {
    doc.rect(left, yy - 4, right - left, 20).fill(NAVY);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', cols.no.x + 3, yy, { width: cols.no.w });
    doc.text('DESCRIPTION', cols.desc.x, yy, { width: cols.desc.w });
    doc.text('QTY', cols.qty.x, yy, { width: cols.qty.w, align: 'right' });
    doc.text('UNIT', cols.unit.x + 4, yy, { width: cols.unit.w });
    doc.text('UNIT COST', cols.cost.x, yy, { width: cols.cost.w, align: 'right' });
    doc.text('AMOUNT', cols.amount.x, yy, { width: cols.amount.w, align: 'right' });
  };
  drawHeader(y);
  y += 22;
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  po.items.forEach((it, i) => {
    if (y > 720) {
      doc.addPage();
      y = 60;
      drawHeader(y);
      y += 22;
      doc.font('Helvetica').fontSize(9).fillColor('#111');
    }
    const rowH = Math.max(16, doc.heightOfString(it.description, { width: cols.desc.w }) + 4);
    doc.fillColor('#111');
    doc.text(String(i + 1), cols.no.x + 3, y, { width: cols.no.w });
    doc.text(it.description, cols.desc.x, y, { width: cols.desc.w });
    doc.text(amount(it.qty), cols.qty.x, y, { width: cols.qty.w, align: 'right' });
    doc.text(it.unit, cols.unit.x + 4, y, { width: cols.unit.w });
    doc.text(amount(it.unitCost), cols.cost.x, y, { width: cols.cost.w, align: 'right' });
    doc.text(amount(it.lineTotal), cols.amount.x, y, { width: cols.amount.w, align: 'right' });
    y += rowH;
    doc.moveTo(left, y - 2).lineTo(right, y - 2).strokeColor(LIGHT).stroke();
  });

  y += 8;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
  doc.text('TOTAL', 360, y, { width: 95, align: 'right' });
  doc.text(money(po.total), 460, y, { width: 85, align: 'right' });

  const footY = 780;
  doc.font('Helvetica').fontSize(8).fillColor(GRAY);
  doc.text(`Prepared by: ${po.createdBy?.fullName ?? '—'}`, left, footY);
  doc.text(`Approved by: ${po.approvedBy?.fullName ?? '—'}`, left, footY + 11);
  doc.text(`Payment: ${po.paymentStatus}   |   ${po.received ? 'RECEIVED' : 'Not received'}`, 330, footY + 11, { width: 215, align: 'right' });

  if (po.approvalStatus !== 'APPROVED') {
    doc.save();
    doc.rotate(-45, { origin: [297, 400] });
    doc.font('Helvetica-Bold').fontSize(90).fillColor(po.approvalStatus === 'REJECTED' ? '#fde2e2' : '#eef1f5');
    doc.text(po.approvalStatus, 60, 360, { width: 480, align: 'center' });
    doc.restore();
  }

  doc.end();
}
