/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * The fixture is real output of "TZ GL Balances" and "TZ Loan Portfolio" as at 26 Nov 2026, run against a
 * Fineract tenant schema seeded with one loan per TCDC class, a restructured loan, a 48-month loan, a written-off
 * loan with a recovery, a loan repaid in 2025, a reversed repayment and a branch loan, plus a GL that mirrors them.
 * Expected figures were worked out by hand from those transactions.
 */
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('exceljs', () => require('exceljs/dist/exceljs.min.js'));

import fixture from './tcdc-forms.fixture.json';
import { statementLabels } from './financial-statements.labels';
import { BalanceRow, LoanRow, Statement } from './financial-statements.model';
import { formatValue, toBalanceRows } from './statement-builder';
import { buildStatementWorkbook } from './statement-export';
import {
  buildTcdcForm1,
  buildTcdcForm2,
  buildTcdcForm3,
  financialQuarterStart,
  loanClass,
  loanTermLine,
  toLoanRows
} from './tcdc-forms';

const t = statementLabels('en-US');
const year = toBalanceRows(fixture.balancesYear);
const quarter = toBalanceRows(fixture.balancesQuarter);
const loans = toLoanRows(fixture.loans);

/** Value of a form line by its line number (first text column). */
function line(statement: Statement, lineNo: string, column = 0): number | null {
  const found = statement.lines.find((l) => l.texts[0] === lineNo);
  if (!found) {
    throw new Error(`line ${lineNo} not found`);
  }
  return found.values[column];
}

describe('TCDC Form 1', () => {
  const f1 = buildTcdcForm1(year, loans, t);

  it('splits loans by term from the loan records', () => {
    expect(line(f1, '1.1')).toBe(3500000);
    expect(line(f1, '1.2')).toBe(5800000);
    expect(line(f1, '1.3')).toBe(4600000);
    expect(line(f1, '1.4')).toBe(0);
    expect(line(f1, '1.5')).toBe(400000);
    expect(line(f1, '1.7')).toBe(-1000000);
    expect(line(f1, '1.8')).toBe(13300000);
  });

  it('places GL balances by tag and computes the totals', () => {
    expect(line(f1, '2.4')).toBe(3000000);
    expect(line(f1, '2.9')).toBe(3000000);
    expect(line(f1, '3.2')).toBe(24140000);
    expect(line(f1, '3.4')).toBe(24140000);
    expect(line(f1, '4.3')).toBe(2000000);
    expect(line(f1, '4.7')).toBe(-150000);
    expect(line(f1, '4.8')).toBe(1850000);
    expect(line(f1, '5.12')).toBe(0);
    expect(line(f1, '6')).toBe(42290000);
    expect(line(f1, '8.1')).toBe(28000000);
    expect(line(f1, '8.2')).toBe(2000000);
    expect(line(f1, '8.5')).toBe(30000000);
    expect(line(f1, '9.3')).toBe(300000);
    expect(line(f1, '9.10')).toBe(300000);
  });

  it('puts past years in 10.8 and the year to date in 10.9', () => {
    expect(line(f1, '10.1')).toBe(15000000);
    expect(line(f1, '10.8')).toBe(500000);
    expect(line(f1, '10.9')).toBe(-3510000);
    expect(line(f1, '10.10')).toBe(11990000);
    expect(line(f1, '11')).toBe(42290000);
  });

  it('leaves headings and the manual line empty', () => {
    expect(line(f1, '1')).toBeNull();
    expect(line(f1, '12')).toBeNull();
    expect(f1.lines.find((l) => l.texts[0] === '12').texts[1]).toContain(t('tcdc.manual'));
  });

  it('passes its checks', () => {
    expect(f1.checks.map((c) => c.ok)).toEqual([
      true,
      true,
      true
    ]);
    expect(f1.untaggedAccounts).toEqual([]);
  });

  it('shows a loan difference when the loan records and GL disagree', () => {
    const fewer = loans.filter((l) => l.accountNo !== 'L000010');
    const check = buildTcdcForm1(year, fewer, t).checks[1];
    expect(check.ok).toBe(false);
    expect(check.difference).toBe(-4600000);
  });
});

describe('TCDC Form 2', () => {
  const f2 = buildTcdcForm2(quarter, year, t);

  it('builds the year to date', () => {
    const y = (n: string) => line(f2, n, 1);
    expect(y('1.1')).toBe(750000);
    expect(y('1.3')).toBe(210000);
    expect(y('1.6')).toBe(960000);
    expect(y('2.2')).toBe(300000);
    expect(y('2.5')).toBe(660000);
    expect(y('3.1')).toBe(80000);
    expect(y('3.2')).toBe(40000);
    expect(y('3.5')).toBe(780000);
    expect(y('4.1')).toBe(1800000);
    expect(y('4.9')).toBe(2890000);
    expect(y('4.10')).toBe(-2110000);
    expect(y('5.1')).toBe(1500000);
    expect(y('5.2')).toBe(100000);
    expect(y('5.4')).toBe(1400000);
    expect(y('6.5')).toBe(0);
    expect(y('7.0')).toBe(-3510000);
    expect(y('8.0')).toBeNull();
  });

  it('builds the quarter to date', () => {
    const q = (n: string) => line(f2, n, 0);
    expect(q('1.1')).toBe(300000);
    expect(q('1.6')).toBe(510000);
    expect(q('2.4')).toBe(0);
    expect(q('3.5')).toBe(510000);
    expect(q('4.9')).toBe(340000);
    expect(q('4.10')).toBe(170000);
    expect(q('5.4')).toBe(1000000);
    expect(q('7.0')).toBe(-830000);
  });

  it('agrees with the Form 1 result and passes its checks', () => {
    expect(line(f2, '7.0', 1)).toBe(line(buildTcdcForm1(year, loans, t), '10.9'));
    expect(f2.checks.every((c) => c.ok)).toBe(true);
  });

  it('flags an income account without a Form 2 tag', () => {
    const untagged: BalanceRow[] = year.map((r) => (r.glCode === '4104' ? { ...r, reportLine: '' } : r));
    const f = buildTcdcForm2(quarter, untagged, t);
    expect(f.untaggedAccounts).toEqual(['4104']);
    expect(f.checks[1].ok).toBe(false);
    expect(f.checks[1].difference).toBe(-40000);
  });
});

describe('TCDC Form 3', () => {
  const f3 = buildTcdcForm3(loans, year, t);

  it('classifies loans and computes provisions', () => {
    const row = (prefix: string) => f3.lines.find((l) => l.texts[0].startsWith(prefix)).values;
    expect(row('3.0')).toEqual([
      4,
      7000000,
      0,
      0
    ]);
    expect(row('3.1')).toEqual([
      1,
      2400000,
      10,
      240000
    ]);
    expect(row('3.2')).toEqual([
      1,
      900000,
      30,
      270000
    ]);
    expect(row('3.3')).toEqual([
      1,
      3400000,
      50,
      1700000
    ]);
    expect(row('3.4')).toEqual([
      1,
      600000,
      100,
      600000
    ]);
    expect(row('3.5')).toEqual([
      8,
      14300000,
      null,
      2810000
    ]);
  });

  it('fills the additional information', () => {
    const extra = (prefix: string) => f3.lines.find((l) => l.texts[0].startsWith(prefix)).values[3];
    expect(extra('3.6')).toBe(2810000);
    expect(extra('3.7')).toBe(1000000);
    expect(extra('3.8')).toBe(1810000);
    expect(extra('3.9')).toBe(500000);
    expect(extra('3.10')).toBe(100000);
    expect(extra('3.11')).toBe(1400000);
  });

  it('agrees with the loan GL accounts', () => {
    expect(f3.checks[0].ok).toBe(true);
  });

  it('formats counts and rates', () => {
    expect(f3.columnFormats).toEqual([
      'count',
      'amount',
      'percent',
      'amount'
    ]);
    expect(formatValue(4, 'count')).toBe('4');
    expect(formatValue(10, 'percent')).toBe('10%');
    expect(formatValue(2400000)).toBe('2,400,000');
  });

  it('writes rates as Excel percentages', () => {
    const sheet = buildStatementWorkbook(
      f3,
      {
        entityName: 'Kilimo SACCOS Ltd',
        officeName: 'Head Office',
        periodText: 'As at 26 November 2026',
        currencyCode: 'TZS',
        preparedBy: 'mifos',
        generatedText: '',
        signatureLabels: [],
        signatureFieldLabels: []
      },
      t
    ).worksheets[0];
    let watch = 0;
    sheet.eachRow((r, n) => {
      if (String(r.getCell(1).value).startsWith('3.1 ')) {
        watch = n;
      }
    });
    expect(sheet.getRow(watch).getCell(2).value).toBe(1);
    expect(sheet.getRow(watch).getCell(4).value).toBe(0.1);
    expect(sheet.getRow(watch).getCell(4).numFmt).toBe('0%');
  });
});

describe('TCDC rules', () => {
  const loan = (termMonths: number, restructured = false): LoanRow => ({
    loanId: 1,
    accountNo: 'X',
    productName: '',
    termMonths,
    restructured,
    outstanding: 1,
    daysOverdue: 0,
    outstanding12mAgo: 0,
    writtenOff12m: 0,
    recovered12m: 0
  });

  it('assigns Form 1 loan lines by original term', () => {
    expect(loanTermLine(loan(12))).toBe('1.1');
    expect(loanTermLine(loan(12.5))).toBe('1.2');
    expect(loanTermLine(loan(36))).toBe('1.2');
    expect(loanTermLine(loan(36.1))).toBe('1.3');
    expect(loanTermLine(loan(48, true))).toBe('1.5');
    expect(loanTermLine(loan(0))).toBe('1.4');
  });

  it('assigns Form 3 classes at the boundaries', () => {
    expect(
      [
        0,
        30,
        31,
        90,
        91,
        180,
        181,
        365,
        366
      ].map((d) => loanClass(d).line)
    ).toEqual([
      '3.0',
      '3.0',
      '3.1',
      '3.1',
      '3.2',
      '3.2',
      '3.3',
      '3.3',
      '3.4'
    ]);
  });

  it('finds the start of the financial quarter', () => {
    expect(financialQuarterStart(new Date(2026, 10, 26), 1)).toEqual(new Date(2026, 9, 1));
    expect(financialQuarterStart(new Date(2026, 0, 5), 1)).toEqual(new Date(2026, 0, 1));
    expect(financialQuarterStart(new Date(2026, 1, 10), 7)).toEqual(new Date(2026, 0, 1));
    expect(financialQuarterStart(new Date(2026, 6, 15), 7)).toEqual(new Date(2026, 6, 1));
    expect(financialQuarterStart(new Date(2026, 5, 30), 7)).toEqual(new Date(2026, 3, 1));
  });
});
