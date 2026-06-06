import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { Response } from 'express';
import { env } from '../../config/env';
import type { serializeCV } from './check-vouchers.service';

type CV = ReturnType<typeof serializeCV>;

const NAVY = '#1e3a5f';
const GRAY = '#6b7280';
const LIGHT = '#e5e7eb';

const money = (n: number) => `PHP ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export function streamCVPdf(cv: CV, res: Response) {
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
  for (const line of [company.address, company.tin ? `TIN: ${company.tin}` : ''].filter(Boolean)) {
    doc.text(line, textX, cy, { width: 320 });
    cy = doc.y;
  }
  const headerBottom = Math.max(cy, 110);

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('CHECK VOUCHER', 330, 48, { width: 215, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#111');
  doc.text(`CV No:  ${cv.number}`, 330, 74, { width: 215, align: 'right' });
  doc.text(`Date:  ${dateStr(cv.date)}`, 330, doc.y, { width: 215, align: 'right' });

  doc.moveTo(left, headerBottom + 8).lineTo(right, headerBottom + 8).strokeColor(LIGHT).stroke();

  let y = headerBottom + 22;
  const row = (label: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, left, y, { width: 110 });
    doc.font('Helvetica').fontSize(10).fillColor('#111').text(value, left + 115, y, { width: 380 });
    y = Math.max(doc.y, y) + 8;
  };
  row('Payee', cv.payee);
  if (cv.bank) row('Bank', cv.bank);
  if (cv.checkNumber) row('Check No.', cv.checkNumber);
  if (cv.checkDate) row('Check Date', dateStr(cv.checkDate));
  if (cv.poNumber) row('For PO', cv.poNumber);
  if (cv.supplier) row('Supplier', cv.supplier.name);
  if (cv.purpose) row('Purpose', cv.purpose);

  // Amount box
  y += 8;
  doc.rect(left, y, right - left, 40).fillAndStroke('#f1f5f9', LIGHT);
  doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9).text('AMOUNT', left + 12, y + 8);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text(money(cv.amount), left + 12, y + 18, { width: right - left - 24, align: 'right' });
  y += 60;

  // Signatures
  const sigY = Math.max(y + 40, 650);
  const third = (right - left) / 3;
  ['Prepared by', 'Approved by', 'Received by'].forEach((label, i) => {
    const x = left + i * third;
    doc.strokeColor('#999').moveTo(x, sigY).lineTo(x + third - 20, sigY).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(label, x, sigY + 4, { width: third - 20 });
  });
  doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(cv.createdBy?.fullName ?? '', left, sigY - 14, { width: third - 20 });

  doc.end();
}
