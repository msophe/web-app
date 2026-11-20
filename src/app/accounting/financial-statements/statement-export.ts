/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * PDF and Excel output for the Financial Statements screen.
 * Both are produced in the browser from the same Statement object that is drawn on screen.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as ExcelJS from 'exceljs';

import { LineKind, Statement, StatementMeta, Translate } from './financial-statements.model';
import { formatAmount } from './statement-builder';

/** Statements with this many numeric columns or more are printed in landscape. */
const LANDSCAPE_FROM_COLUMNS = 3;

const NAVY: [
  number,
  number,
  number
] = [
  26,
  35,
  126
];

function fileBaseName(statement: Statement, meta: StatementMeta): string {
  const clean = (text: string) =>
    text
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 60);
  return `${clean(meta.entityName)}_${clean(statement.title)}_${clean(meta.periodText)}`;
}

function rowStyle(kind: LineKind): { fontStyle: 'normal' | 'bold' | 'italic'; fillColor?: [
    number,
    number,
    number
  ] } {
  switch (kind) {
    case 'section':
      return {
        fontStyle: 'bold',
        fillColor: [
          232,
          234,
          246
        ]
      };
    case 'group':
      return { fontStyle: 'bold' };
    case 'subtotal':
      return { fontStyle: 'italic' };
    case 'total':
      return {
        fontStyle: 'bold',
        fillColor: [
          245,
          245,
          245
        ]
      };
    case 'grand-total':
      return {
        fontStyle: 'bold',
        fillColor: [
          224,
          224,
          224
        ]
      };
    default:
      return { fontStyle: 'normal' };
  }
}

/**
 * Builds the PDF and starts the download.
 */
export function exportStatementPdf(statement: Statement, meta: StatementMeta, t: Translate): void {
  const landscape = statement.numericColumns.length >= LANDSCAPE_FROM_COLUMNS || statement.textColumns.length > 2;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  if (meta.logoDataUrl) {
    try {
      const format = meta.logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(meta.logoDataUrl, format, margin, y, 18, 18);
    } catch {
      // A logo that cannot be decoded is left out; the statement is still produced.
    }
  }

  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(meta.entityName, pageWidth / 2, y + 5, { align: 'center' });
  pdf.setFontSize(12);
  pdf.text(statement.title, pageWidth / 2, y + 12, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(
    `${meta.periodText}   |   ${t('meta.office')}: ${meta.officeName}   |   ${t('meta.currency')} ${meta.currencyCode}`,
    pageWidth / 2,
    y + 18,
    { align: 'center' }
  );
  y += 24;

  const columnCount = statement.textColumns.length + statement.numericColumns.length;
  const numericStart = statement.textColumns.length;
  const columnStyles: { [index: number]: any } = {};
  for (let i = numericStart; i < columnCount; i++) {
    columnStyles[i] = { halign: 'right', cellWidth: landscape ? 30 : 34 };
  }
  if (statement.textColumns[0] === t('col.code')) {
    columnStyles[0] = { cellWidth: 16 };
  }

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [
      [
        ...statement.textColumns,
        ...statement.numericColumns
      ]
    ],
    body: statement.lines.map((line) => [
      ...line.texts,
      ...line.values.map((value) => formatAmount(value))
    ]),
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fillColor: NAVY, textColor: 255 },
    columnStyles,
    didParseCell: (data: any) => {
      if (data.section !== 'body') {
        if (data.column.index >= numericStart) {
          data.cell.styles.halign = 'right';
        }
        return;
      }
      const line = statement.lines[data.row.index];
      const style = rowStyle(line.kind);
      data.cell.styles.fontStyle = style.fontStyle;
      if (style.fillColor) {
        data.cell.styles.fillColor = style.fillColor;
      }
      if (line.kind === 'account' && data.column.index === 1 && numericStart === 2) {
        data.cell.styles.cellPadding = { left: 4, top: 1.4, bottom: 1.4, right: 1.4 };
      }
    }
  });

  y = (pdf as any).lastAutoTable.finalY + 6;

  // Reconciliation checks
  if (statement.checks.length) {
    pdf.setFontSize(8.5);
    statement.checks.forEach((c) => {
      const text = c.ok
        ? `${c.label}: ${t('check.ok')}`
        : `${c.label}: ${t('check.difference')} ${formatAmount(c.difference)}`;
      pdf.setTextColor(c.ok ? 46 : 198, c.ok ? 125 : 40, c.ok ? 50 : 40);
      pdf.text(text, margin, y);
      y += 4.5;
    });
    pdf.setTextColor(0, 0, 0);
  }

  // Signature blocks: prepared by, reviewed by, approved by
  const blockHeight = 26;
  if (y + blockHeight > pageHeight - 18) {
    pdf.addPage();
    y = margin;
  }
  y += 4;
  const blocks = meta.signatureLabels.length;
  const blockWidth = (pageWidth - 2 * margin - (blocks - 1) * 6) / blocks;
  meta.signatureLabels.forEach((label, index) => {
    const x = margin + index * (blockWidth + 6);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(label, x, y);
    pdf.setFont('helvetica', 'normal');
    meta.signatureFieldLabels.forEach((field, fieldIndex) => {
      const lineY = y + 7 + fieldIndex * 7;
      pdf.text(`${field}:`, x, lineY);
      pdf.setDrawColor(150);
      pdf.line(x + 18, lineY + 0.5, x + blockWidth, lineY + 0.5);
    });
  });
  if (meta.preparedBy) {
    pdf.setFontSize(8);
    pdf.text(meta.preparedBy, margin + 19, y + 6);
  }

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFontSize(7.5);
    pdf.setTextColor(110);
    pdf.text(meta.generatedText, margin, pageHeight - 8);
    pdf.text(`${t('meta.page')} ${page} ${t('meta.of')} ${pages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right'
    });
  }

  pdf.save(`${fileBaseName(statement, meta)}.pdf`);
}

/**
 * Builds the workbook in memory. Separate from the download so it can be tested.
 */
export function buildStatementWorkbook(statement: Statement, meta: StatementMeta, t: Translate): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.preparedBy || 'Mifos X';
  const sheet = workbook.addWorksheet(statement.title.substring(0, 31), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const columnCount = statement.textColumns.length + statement.numericColumns.length;
  const numericStart = statement.textColumns.length;
  const numberFormat = '#,##0.00;(#,##0.00);"-"';

  const titleRows = [
    meta.entityName,
    statement.title,
    meta.periodText,
    `${t('meta.office')}: ${meta.officeName}   |   ${t('meta.currency')} ${meta.currencyCode}`
  ];
  titleRows.forEach((text, index) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, columnCount);
    row.getCell(1).font = { bold: index < 2, size: index === 0 ? 14 : index === 1 ? 12 : 10 };
    row.getCell(1).alignment = { horizontal: 'center' };
  });
  sheet.addRow([]);

  const header = sheet.addRow([
    ...statement.textColumns,
    ...statement.numericColumns
  ]);
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
    cell.alignment = { horizontal: col > numericStart ? 'right' : 'left' };
  });

  statement.lines.forEach((line) => {
    const row = sheet.addRow([
      ...line.texts,
      ...line.values.map((value) => (value === null ? null : value))
    ]);
    const bold = line.kind !== 'account' && line.kind !== 'subtotal';
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold, italic: line.kind === 'subtotal' };
      if (col > numericStart) {
        cell.numFmt = numberFormat;
      }
      if (line.kind === 'grand-total' || line.kind === 'total') {
        cell.border = { top: { style: 'thin' }, bottom: { style: line.kind === 'grand-total' ? 'double' : 'thin' } };
      }
    });
  });

  sheet.addRow([]);
  statement.checks.forEach((c) =>
    sheet.addRow([`${c.label}: ${c.ok ? t('check.ok') : `${t('check.difference')} ${formatAmount(c.difference)}`}`])
  );
  sheet.addRow([meta.generatedText]);

  statement.textColumns.forEach((name, index) => {
    sheet.getColumn(index + 1).width = name === t('col.code') ? 10 : name === t('col.date') ? 12 : 44;
  });
  statement.numericColumns.forEach((_, index) => (sheet.getColumn(numericStart + index + 1).width = 18));
  sheet.views = [{ state: 'frozen', ySplit: titleRows.length + 2 }];
  return workbook;
}

/**
 * Builds the workbook and starts the download.
 */
export async function exportStatementExcel(statement: Statement, meta: StatementMeta, t: Translate): Promise<void> {
  const workbook = buildStatementWorkbook(statement, meta, t);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileBaseName(statement, meta)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
