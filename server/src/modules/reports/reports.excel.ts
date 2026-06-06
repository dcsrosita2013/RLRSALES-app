import ExcelJS from 'exceljs';
import { env } from '../../config/env';
import type { ReportResult } from './reports.service';

const NAVY = 'FF1E3A5F';

export async function reportToBuffer(result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = env.company.name;
  const ws = wb.addWorksheet('Report');
  const nCols = Math.max(result.columns.length, 1);

  // Title
  ws.mergeCells(1, 1, 1, nCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = env.company.name;
  titleCell.font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, nCols);
  const sub = ws.getCell(2, 1);
  sub.value = result.title;
  sub.font = { bold: true, size: 11, color: { argb: 'FF6B7280' } };

  // Header
  const headerRowIdx = 4;
  const headerRow = ws.getRow(headerRowIdx);
  result.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: c.money || c.align === 'right' ? 'right' : 'left' };
  });
  headerRow.commit();

  // Data
  result.rows.forEach((row, ri) => {
    const r = ws.getRow(headerRowIdx + 1 + ri);
    result.columns.forEach((c, ci) => {
      const cell = r.getCell(ci + 1);
      const value = row[c.key];
      cell.value = value as ExcelJS.CellValue;
      if (c.money && typeof value === 'number') cell.numFmt = '#,##0.00';
      if (c.money || c.align === 'right') cell.alignment = { horizontal: 'right' };
    });
    r.commit();
  });

  // Totals
  if (result.totals) {
    const r = ws.getRow(headerRowIdx + 1 + result.rows.length + 1);
    r.getCell(1).value = 'TOTAL';
    r.getCell(1).font = { bold: true };
    result.columns.forEach((c, ci) => {
      if (result.totals![c.key] !== undefined) {
        const cell = r.getCell(ci + 1);
        cell.value = result.totals![c.key];
        cell.font = { bold: true };
        if (c.money) cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });
    r.commit();
  }

  result.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(12, c.label.length + 4);
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
