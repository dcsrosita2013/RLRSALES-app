import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { Response } from 'express';
import { env } from '../../config/env';
import type { serializeDR } from './delivery-receipts.service';

type DR = ReturnType<typeof serializeDR>;

const NAVY = '#1e3a5f';
const GRAY = '#6b7280';
const LIGHT = '#e5e7eb';

const qtyFmt = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

function termsText(dr: DR) {
  return dr.termsType === 'NET' ? `Net ${dr.netDays ?? ''} days` : 'COD';
}

export function streamDRPdf(dr: DR, res: Response) {
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

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('DELIVERY RECEIPT', 320, 48, { width: 225, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  doc.text(`DR No:  ${dr.number}`, 320, 74, { width: 225, align: 'right' });
  doc.text(`Date:  ${new Date(dr.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`, 320, doc.y, { width: 225, align: 'right' });
  if (dr.poNumber) doc.text(`PO No:  ${dr.poNumber}`, 320, doc.y, { width: 225, align: 'right' });
  doc.text(`Terms:  ${termsText(dr)}`, 320, doc.y, { width: 225, align: 'right' });
  if (dr.invoiceNumber) doc.text(`Invoice:  ${dr.invoiceNumber}`, 320, doc.y, { width: 225, align: 'right' });

  doc.moveTo(left, headerBottom + 8).lineTo(right, headerBottom + 8).strokeColor(LIGHT).stroke();

  const billY = headerBottom + 18;
  doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9).text('DELIVER TO', left, billY);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(dr.customerName, left, billY + 12, { width: 320 });
  if (dr.agent) doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`Agent: ${dr.agent.name}`, left, doc.y + 1, { width: 320 });

  const cols = {
    no: { x: left, w: 28 },
    desc: { x: 82, w: 318 },
    qty: { x: 400, w: 70 },
    unit: { x: 470, w: 75 },
  };
  let y = Math.max(doc.y + 16, billY + 56);
  const drawHeader = (yy: number) => {
    doc.rect(left, yy - 4, right - left, 20).fill(NAVY);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', cols.no.x + 3, yy, { width: cols.no.w });
    doc.text('DESCRIPTION', cols.desc.x, yy, { width: cols.desc.w });
    doc.text('QTY', cols.qty.x, yy, { width: cols.qty.w, align: 'right' });
    doc.text('UNIT', cols.unit.x + 6, yy, { width: cols.unit.w });
  };
  drawHeader(y);
  y += 22;
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  dr.items.forEach((it, i) => {
    if (y > 700) {
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
    doc.text(qtyFmt(it.qty), cols.qty.x, y, { width: cols.qty.w, align: 'right' });
    doc.text(it.unit, cols.unit.x + 6, y, { width: cols.unit.w });
    y += rowH;
    doc.moveTo(left, y - 2).lineTo(right, y - 2).strokeColor(LIGHT).stroke();
  });

  if (dr.notes) {
    y += 8;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`Notes: ${dr.notes}`, left, y, { width: right - left });
    y = doc.y;
  }

  // Signature lines
  const sigY = Math.max(y + 50, 700);
  doc.strokeColor('#999');
  doc.moveTo(left, sigY).lineTo(left + 200, sigY).stroke();
  doc.moveTo(right - 200, sigY).lineTo(right, sigY).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(GRAY);
  doc.text(`Delivered by: ${dr.createdBy?.fullName ?? ''}`, left, sigY + 4, { width: 200 });
  doc.text('Received by (signature over printed name / date)', right - 200, sigY + 4, { width: 200, align: 'left' });

  doc.end();
}
