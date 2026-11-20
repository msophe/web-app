/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * The fixture is real output of the three Phase 3 reports (period 1 Jan to 17 Nov 2026) run against a
 * Fineract tenant schema seeded with 2025 and 2026 test transactions. Expected figures were worked out
 * by hand from those transactions.
 */
// jsPDF ships as an ES module that this Jest setup does not transform; the PDF path is not unit tested.
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => jest.fn());
// Same approach as spreadsheet-preview.service.spec.ts: use the pre-built exceljs bundle under Jest.
jest.mock('exceljs', () => require('exceljs/dist/exceljs.min.js'));

import fixture from './statement-builder.fixture.json';
import { statementLabels } from './financial-statements.labels';
import { Statement } from './financial-statements.model';
import {
  buildBalanceSheet,
  buildCashFlow,
  buildChangesInEquity,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
  financialYearStart,
  formatAmount,
  tagSection,
  toBalanceRows,
  toCashFlowRows,
  toLedgerRows
} from './statement-builder';
import { buildStatementWorkbook } from './statement-export';

const t = statementLabels('en-US');
const balances = toBalanceRows(fixture.balances);

function valueOf(statement: Statement, label: string, column = 0): number | null {
  const line = statement.lines.find((l) => l.texts.includes(label));
  if (!line) {
    throw new Error(`line "${label}" not found in ${statement.title}`);
  }
  return line.values[column];
}

describe('statement builder', () => {
  it('parses the generic result set', () => {
    expect(balances.length).toBe(40);
    const bank = balances.find((r) => r.glCode === '1103');
    expect(bank.reportLine).toBe('F1-3.2');
    expect(bank.openingBalance).toBe(26200000);
    expect(bank.closingBalance).toBe(16600000);
  });

  it('reads TCDC tags', () => {
    expect(tagSection('F1-3.1')).toEqual({ form: 1, section: 3 });
    expect(tagSection('F1-1')).toEqual({ form: 1, section: 1 });
    expect(tagSection('F2-10.12')).toEqual({ form: 2, section: 10 });
    expect(tagSection('')).toBeNull();
    expect(tagSection('X-1')).toBeNull();
  });

  it('builds a balanced trial balance', () => {
    const tb = buildTrialBalance(balances, t);
    const total = tb.lines[tb.lines.length - 1].values;
    expect(total[2]).toBe(58600000);
    expect(total[3]).toBe(58600000);
    expect(total[0]).toBe(total[1]);
    expect(tb.checks.every((c) => c.ok)).toBe(true);
    // contra accounts appear on the credit side
    const allowance = tb.lines.find((l) => l.texts[0] === '1299');
    expect(allowance.values[3]).toBe(500000);
    expect(allowance.values[2]).toBeNull();
  });

  it('builds a balance sheet that balances, splitting prior and current results', () => {
    const bs = buildBalanceSheet(balances, t);
    expect(valueOf(bs, t('line.totalAssets'))).toBe(51100000);
    expect(valueOf(bs, t('line.totalLiabilities'))).toBe(33100000);
    expect(valueOf(bs, t('line.priorYearsResult'))).toBe(700000);
    expect(valueOf(bs, t('line.currentYearResult'))).toBe(-2700000);
    expect(valueOf(bs, t('line.totalEquity'))).toBe(18000000);
    expect(valueOf(bs, t('line.totalLiabilitiesAndEquity'))).toBe(51100000);
    expect(bs.checks[0].ok).toBe(true);
    expect(valueOf(bs, `${t('line.totalOf')} cash and bank`)).toBe(20100000);
    expect(bs.untaggedAccounts).toEqual([]);
  });

  it('builds the income statement for the period', () => {
    const is = buildIncomeStatement(balances, t);
    expect(valueOf(is, t('line.totalIncome'))).toBe(1600000);
    expect(valueOf(is, t('line.totalExpenses'))).toBe(4300000);
    expect(valueOf(is, t('line.periodResult'))).toBe(-2700000);
  });

  it('builds changes in equity that agree with net assets', () => {
    const eq = buildChangesInEquity(balances, t);
    const total = eq.lines[eq.lines.length - 1].values;
    expect(total[0]).toBe(20700000);
    expect(total[3]).toBe(18000000);
    expect(eq.checks[0].ok).toBe(true);
  });

  it('builds a cash flow statement that reconciles to cash', () => {
    const cf = buildCashFlow(toCashFlowRows(fixture.cashFlow), t);
    expect(valueOf(cf, t('line.netOperating'), 2)).toBe(2900000);
    expect(valueOf(cf, t('line.netInvesting'), 2)).toBe(-9000000);
    expect(valueOf(cf, t('line.netCashChange'), 2)).toBe(-6100000);
    expect(valueOf(cf, t('line.cashAtStart'), 2)).toBe(26200000);
    expect(valueOf(cf, t('line.cashAtEnd'), 2)).toBe(20100000);
    expect(cf.checks[0].ok).toBe(true);
    // transfers between two cash accounts are not cash flows
    expect(cf.lines.some((l) => l.texts[0] === '1101')).toBe(false);
  });

  it('builds a general ledger with running balance', () => {
    const rows = toLedgerRows(fixture.ledger1103);
    expect(rows[0].entryDate).toBe('2026-01-01');
    const gl = buildGeneralLedger(rows, '1103 Bank Current Account', t);
    expect(gl.lines[0].values[2]).toBe(26200000);
    const closing = gl.lines[gl.lines.length - 1].values;
    expect(closing[2]).toBe(16600000);
    expect(26200000 + closing[0] - closing[1]).toBe(16600000);
    expect(gl.lines.filter((l) => l.transactionId).length).toBe(10);
  });

  it('hides zero balances unless asked', () => {
    const shown = buildTrialBalance(balances, t).lines.length;
    const all = buildTrialBalance(balances, t, true).lines.length;
    expect(all).toBe(balances.length + 1);
    expect(shown).toBeLessThan(all);
  });

  it('finds the start of the financial year', () => {
    expect(financialYearStart(new Date(2026, 10, 17), 1)).toEqual(new Date(2026, 0, 1));
    expect(financialYearStart(new Date(2026, 10, 17), 7)).toEqual(new Date(2026, 6, 1));
    expect(financialYearStart(new Date(2026, 2, 3), 7)).toEqual(new Date(2025, 6, 1));
  });

  it('formats amounts the accounting way', () => {
    expect(formatAmount(1234567)).toBe('1,234,567');
    expect(formatAmount(-2700000)).toBe('(2,700,000)');
    expect(formatAmount(0)).toBe('-');
    expect(formatAmount(10.5)).toBe('10.50');
    expect(formatAmount(null)).toBe('');
  });

  it('labels in Swahili', () => {
    const sw = statementLabels('sw-SW');
    expect(sw('title.balanceSheet')).toBe('Taarifa ya Hali ya Fedha');
    expect(sw('no.such.key')).toBe('no.such.key');
  });

  it('builds an Excel workbook with numeric cells', () => {
    const bs = buildBalanceSheet(balances, t);
    const workbook = buildStatementWorkbook(
      bs,
      {
        entityName: 'Kilimo SACCOS Ltd',
        officeName: 'Head Office',
        periodText: 'As at 17 November 2026',
        currencyCode: 'TZS',
        preparedBy: 'mifos',
        generatedText: 'Generated 17 November 2026',
        signatureLabels: [],
        signatureFieldLabels: []
      },
      t
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('A1').value).toBe('Kilimo SACCOS Ltd');
    let assetsRow = 0;
    sheet.eachRow((row, number) => {
      if (row.getCell(2).value === t('line.totalAssets')) {
        assetsRow = number;
      }
    });
    expect(assetsRow).toBeGreaterThan(0);
    expect(sheet.getRow(assetsRow).getCell(3).value).toBe(51100000);
  });
});
