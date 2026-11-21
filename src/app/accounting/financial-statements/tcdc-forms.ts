/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * TCDC off-site returns (SACCOS Off-Site Supervision Manual, Appendix B):
 * Form 1 Statement of Financial Position, Form 2 Statement of Comprehensive Income,
 * Form 3 Loan Classification and Provisioning.
 *
 * Line numbers and descriptions follow the TCDC templates word for word, so the forms stay in English
 * in both languages. Plain TypeScript, no Angular, so the arithmetic is unit tested.
 */

import {
  ASSET,
  BalanceRow,
  EXPENSE,
  INCOME,
  LoanRow,
  Statement,
  StatementCheck,
  StatementLine,
  Translate
} from './financial-statements.model';
import { parseResultSet, round2, tagSection } from './statement-builder';

/** Loans with an original term up to this many months are short-term (Form 1 line 1.1). */
export const SHORT_TERM_MAX_MONTHS = 12;
/** Loans with an original term up to this many months (and above short-term) are medium-term (line 1.2). */
export const MEDIUM_TERM_MAX_MONTHS = 36;

type LineKind = 'heading' | 'item' | 'total' | 'grand';

interface FormLine {
  line: string;
  label: string;
  kind: LineKind;
  /** For totals: the lines added up (a leading "-" subtracts). */
  sum?: string[];
  /** Not available from the system: completed by the SACCOS. */
  manual?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Form 1

const FORM1: FormLine[] = [
  { line: '1', label: 'Earning Assets – Loans', kind: 'heading' },
  { line: '1.1', label: 'Short-term Loans (< 1 year)', kind: 'item' },
  { line: '1.2', label: 'Medium-term Loans (1-3 years)', kind: 'item' },
  { line: '1.3', label: 'Long-term Loans (>3 years)', kind: 'item' },
  { line: '1.4', label: 'Other Loans', kind: 'item' },
  { line: '1.5', label: 'Restructured Loans', kind: 'item' },
  { line: '1.6', label: 'Loan Participations', kind: 'item' },
  { line: '1.7', label: '(Less the Allowance for Loan Losses)', kind: 'item' },
  { line: '1.8', label: 'Total Net Loans', kind: 'total', sum: [
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5',
      '1.6',
      '1.7'
    ] },
  { line: '2', label: 'Earning Assets – Investments', kind: 'heading' },
  { line: '2.1', label: 'Government Securities < 30 day maturity', kind: 'item' },
  { line: '2.2', label: 'Government Securities > 30 day maturity', kind: 'item' },
  { line: '2.3', label: 'Investments in Financial Institutions < 30 day maturity', kind: 'item' },
  { line: '2.4', label: 'Investments in Financial Institutions > 30 day maturity', kind: 'item' },
  { line: '2.5', label: 'Investment in other SACCOS or 2nd tier organizations', kind: 'item' },
  { line: '2.6', label: 'Other Investments', kind: 'item' },
  { line: '2.7', label: '(Less the Allowance for Investment Loss)', kind: 'item' },
  { line: '2.8', label: 'Non-Financial Investments', kind: 'item' },
  { line: '2.9', label: 'Total Net Investments', kind: 'total', sum: [
      '2.1',
      '2.2',
      '2.3',
      '2.4',
      '2.5',
      '2.6',
      '2.7',
      '2.8'
    ] },
  { line: '3', label: 'Non-Earning Assets – Cash', kind: 'heading' },
  { line: '3.1', label: 'Cash on Hand', kind: 'item' },
  { line: '3.2', label: 'Current Accounts with other financial institutions', kind: 'item' },
  { line: '3.3', label: 'Other Non-earning Deposits with other financial institutions', kind: 'item' },
  { line: '3.4', label: 'Total Cash and Non-earning Accounts', kind: 'total', sum: [
      '3.1',
      '3.2',
      '3.3'
    ] },
  { line: '4', label: 'Non-Earning Assets – Fixed Assets', kind: 'heading' },
  { line: '4.1', label: 'Land (cost)', kind: 'item' },
  { line: '4.2', label: 'Building (cost)', kind: 'item' },
  { line: '4.3', label: 'Furniture, Fixture and Equipment (cost)', kind: 'item' },
  { line: '4.4', label: 'Other Fixed Assets (cost)', kind: 'item' },
  { line: '4.5', label: 'Leasehold Improvements (cost)', kind: 'item' },
  { line: '4.6', label: 'Revaluation of Fixed Assets', kind: 'item' },
  { line: '4.7', label: '(Less Accumulated Depreciation)', kind: 'item' },
  { line: '4.8', label: 'Total Net Fixed Assets', kind: 'total', sum: [
      '4.1',
      '4.2',
      '4.3',
      '4.4',
      '4.5',
      '4.6',
      '4.7'
    ] },
  { line: '5', label: 'Non-Earning Assets – Other Assets', kind: 'heading' },
  { line: '5.1', label: 'Accounts Receivable due in < 30 days', kind: 'item' },
  { line: '5.2', label: 'Accounts Receivable due in > 30 days', kind: 'item' },
  { line: '5.3', label: 'Accrued Income on Loans', kind: 'item' },
  { line: '5.4', label: 'Accrued Income on Investments', kind: 'item' },
  { line: '5.5', label: 'Other Accrued Income', kind: 'item' },
  { line: '5.6', label: 'Prepaid Expenses', kind: 'item' },
  { line: '5.7', label: 'Internal Receivables', kind: 'item' },
  { line: '5.8', label: 'Assets in Liquidation', kind: 'item' },
  { line: '5.9', label: 'Suspense Accounts', kind: 'item' },
  { line: '5.10', label: 'Other Assets', kind: 'item' },
  { line: '5.11', label: '(Less Allowance for Other Asset Losses)', kind: 'item' },
  {
    line: '5.12',
    label: 'Total Other Assets',
    kind: 'total',
    sum: [
      '5.1',
      '5.2',
      '5.3',
      '5.4',
      '5.5',
      '5.6',
      '5.7',
      '5.8',
      '5.9',
      '5.10',
      '5.11'
    ]
  },
  { line: '6', label: 'TOTAL ASSETS', kind: 'grand', sum: [
      '1.8',
      '2.9',
      '3.4',
      '4.8',
      '5.12'
    ] },
  { line: '7', label: 'Interest Bearing - Borrowed Funds', kind: 'heading' },
  { line: '7.1', label: 'Short-Term Borrowing (< 1 year maturity)', kind: 'item' },
  { line: '7.2', label: 'Long-Term Borrowings (> 1 year maturity)', kind: 'item' },
  { line: '7.3', label: 'Total Borrowed Funds', kind: 'total', sum: [
      '7.1',
      '7.2'
    ] },
  { line: '8', label: 'Interest Bearing – Savings Deposits', kind: 'heading' },
  { line: '8.1', label: 'Savings Accounts', kind: 'item' },
  { line: '8.2', label: 'Term Deposits', kind: 'item' },
  { line: '8.3', label: 'Special Savings', kind: 'item' },
  { line: '8.4', label: 'Other Savings', kind: 'item' },
  { line: '8.5', label: 'Total Savings and Deposits', kind: 'total', sum: [
      '8.1',
      '8.2',
      '8.3',
      '8.4'
    ] },
  { line: '9', label: 'Non-Interest Bearing Liabilities', kind: 'heading' },
  { line: '9.1', label: 'Accounts Payable due in < 30 days', kind: 'item' },
  { line: '9.2', label: 'Other Payables', kind: 'item' },
  { line: '9.3', label: 'Accrued Interest Payable on Savings', kind: 'item' },
  { line: '9.4', label: 'Accrued Interest Payable on External Credit', kind: 'item' },
  { line: '9.5', label: 'Taxes Payable', kind: 'item' },
  { line: '9.6', label: 'Internal Payable', kind: 'item' },
  { line: '9.7', label: 'Suspense Accounts', kind: 'item' },
  { line: '9.8', label: 'Accounting Discrepancies', kind: 'item' },
  { line: '9.9', label: 'Other Liabilities', kind: 'item' },
  {
    line: '9.10',
    label: 'Total Non-Interest Bearing Liabilities',
    kind: 'total',
    sum: [
      '9.1',
      '9.2',
      '9.3',
      '9.4',
      '9.5',
      '9.6',
      '9.7',
      '9.8',
      '9.9'
    ]
  },
  { line: '10', label: 'Equity', kind: 'heading' },
  { line: '10.1', label: 'Member Shares', kind: 'item' },
  { line: '10.2', label: 'Voluntary Shares', kind: 'item' },
  { line: '10.3', label: 'Other Shares', kind: 'item' },
  { line: '10.4', label: 'Fixed Asset Revaluation Reserve', kind: 'item' },
  { line: '10.5', label: 'Transitory Capital', kind: 'item' },
  { line: '10.6', label: 'Donations and Grants (cash only)', kind: 'item' },
  { line: '10.7', label: 'Reserve Funds', kind: 'item' },
  { line: '10.8', label: 'Retained Earnings (Profit/Loss for Past Years)', kind: 'item' },
  { line: '10.9', label: 'Profit/Loss for the Current Year', kind: 'item' },
  {
    line: '10.10',
    label: 'Total Equity (Sum 10.1-10.9)',
    kind: 'total',
    sum: [
      '10.1',
      '10.2',
      '10.3',
      '10.4',
      '10.5',
      '10.6',
      '10.7',
      '10.8',
      '10.9'
    ]
  },
  { line: '11', label: 'TOTAL LIABILITIES AND EQUITY', kind: 'grand', sum: [
      '7.3',
      '8.5',
      '9.10',
      '10.10'
    ] },
  {
    line: '12',
    label: 'Off Balance Sheet – Other SACCOS Commitments and Obligations such as unfunded member lines of credit',
    kind: 'item',
    manual: true
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Form 2

/** Form 2 lines that reduce profit. Their amounts are shown as positive expenses. */
const FORM2_EXPENSE_LINES = new Set([
  '2.1',
  '2.2',
  '2.3',
  '4.1',
  '4.2',
  '4.3',
  '4.4',
  '4.5',
  '4.6',
  '4.7',
  '4.8',
  '5.1',
  '5.3',
  '6.2',
  '6.4'
]);

const FORM2: FormLine[] = [
  { line: '1', label: 'Interest Income', kind: 'heading' },
  { line: '1.1', label: 'Interest Income on Loans', kind: 'item' },
  { line: '1.2', label: 'Interest Income - Government Securities', kind: 'item' },
  { line: '1.3', label: 'Interest Income – Deposits in Financial Institutions', kind: 'item' },
  { line: '1.4', label: 'Interest Income – Other SACCOS and 2nd Tier organizations', kind: 'item' },
  { line: '1.5', label: 'Interest Income – Other Investments', kind: 'item' },
  { line: '1.6', label: 'Total Interest Income (Sum 1.1-1.5)', kind: 'total', sum: [
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5'
    ] },
  { line: '2', label: 'Interest Expense', kind: 'heading' },
  { line: '2.1', label: 'Interest Expense on Borrowings', kind: 'item' },
  { line: '2.2', label: 'Interest Expense on Member Savings and Deposit Accounts', kind: 'item' },
  { line: '2.3', label: 'Other Interest Expense', kind: 'item' },
  { line: '2.4', label: 'Total Interest Expense (Sum 2.1-2.3)', kind: 'total', sum: [
      '2.1',
      '2.2',
      '2.3'
    ] },
  {
    line: '2.5',
    label: 'Net Interest Income = (Total Interest Income – Total Interest Expense)',
    kind: 'grand',
    sum: [
      '1.6',
      '-2.4'
    ]
  },
  { line: '3', label: 'Non Interest Income', kind: 'heading' },
  { line: '3.1', label: 'Commissions and Fees', kind: 'item' },
  { line: '3.2', label: 'Penalties', kind: 'item' },
  { line: '3.3', label: 'Other Non Interest Income', kind: 'item' },
  { line: '3.4', label: 'Total Non Interest Income (Sum 3.1-3.3)', kind: 'total', sum: [
      '3.1',
      '3.2',
      '3.3'
    ] },
  {
    line: '3.5',
    label: 'Gross Operating Income (Loss) = (Net Interest Income + Non Interest Income)',
    kind: 'grand',
    sum: [
      '2.5',
      '3.4'
    ]
  },
  { line: '4', label: 'Operating Expenses', kind: 'heading' },
  { line: '4.1', label: 'Salaries and Wages', kind: 'item' },
  { line: '4.2', label: 'Other Personnel Costs and Benefits', kind: 'item' },
  { line: '4.3', label: 'Office Occupancy (Rent)', kind: 'item' },
  {
    line: '4.4',
    label:
      'Operations Expenses (supplies, travel, training, communications, utilities, marketing, other administrative)',
    kind: 'item'
  },
  { line: '4.5', label: 'Professional Fees and Services', kind: 'item' },
  { line: '4.6', label: 'Depreciation', kind: 'item' },
  { line: '4.7', label: 'Maintenance/Repairs', kind: 'item' },
  { line: '4.8', label: 'Other Operating Expenses', kind: 'item' },
  {
    line: '4.9',
    label: 'Total Operating Expenses (Sum 4.1-4.8)',
    kind: 'total',
    sum: [
      '4.1',
      '4.2',
      '4.3',
      '4.4',
      '4.5',
      '4.6',
      '4.7',
      '4.8'
    ]
  },
  {
    line: '4.10',
    label: 'Net Operating Income (Loss) = (Gross Operating Income – Total Operating Expenses)',
    kind: 'grand',
    sum: [
      '3.5',
      '-4.9'
    ]
  },
  { line: '5', label: 'Loan Loss Provisions (Recoveries)', kind: 'heading' },
  { line: '5.1', label: 'Provision for Loan Losses', kind: 'item' },
  { line: '5.2', label: '(Less: Recoveries)', kind: 'item' },
  { line: '5.3', label: 'Provisions for Investments and Other Losses', kind: 'item' },
  { line: '5.4', label: 'Net Provision for Losses (Sum 5.1+5.3-5.2)', kind: 'total', sum: [
      '5.1',
      '5.3',
      '-5.2'
    ] },
  { line: '6', label: 'Extraordinary Items', kind: 'heading' },
  { line: '6.1', label: 'Extraordinary Income', kind: 'item' },
  { line: '6.2', label: 'Extraordinary Expenses', kind: 'item' },
  { line: '6.3', label: 'Donations and Grants (cash only)', kind: 'item' },
  { line: '6.4', label: 'Prior Period Adjustments', kind: 'item' },
  { line: '6.5', label: 'Total Extraordinary Income/(Expenses)', kind: 'total', sum: [
      '6.1',
      '-6.2',
      '6.3',
      '-6.4'
    ] },
  {
    line: '7.0',
    label:
      'Net Profit for Period = (Net Operating Income +/- Net Provision for Loan Loss +/- Total Extraordinary Income)',
    kind: 'grand',
    sum: [
      '4.10',
      '-5.4',
      '6.5'
    ]
  },
  { line: '8.0', label: 'Dividend Paid on Shares', kind: 'item', manual: true }
];

// ---------------------------------------------------------------------------------------------------------------
// Form 3

/** TCDC loan classes: upper bound of days overdue (inclusive) and provision rate in percent. */
export const FORM3_CLASSES: { line: string; label: string; maxDays: number; rate: number }[] = [
  { line: '3.0', label: 'Current Loans', maxDays: 30, rate: 0 },
  { line: '3.1', label: 'Overdue (watch) 31-90 days', maxDays: 90, rate: 10 },
  { line: '3.2', label: 'Overdue (substandard) 91 to 180 days', maxDays: 180, rate: 30 },
  { line: '3.3', label: 'Overdue (doubtful) 181-365 days', maxDays: 365, rate: 50 },
  { line: '3.4', label: 'Overdue (loss) >365 days', maxDays: Number.POSITIVE_INFINITY, rate: 100 }
];

// ---------------------------------------------------------------------------------------------------------------
// Helpers

function toNumber(value: any): number {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/** Rows of the "TZ Loan Portfolio" report. */
export function toLoanRows(response: any): LoanRow[] {
  return parseResultSet(response).map((row) => ({
    loanId: toNumber(row['loan_id']),
    accountNo: String(row['account_no'] ?? ''),
    productName: String(row['product_name'] ?? ''),
    termMonths: toNumber(row['term_months']),
    restructured: toNumber(row['restructured']) === 1 || row['restructured'] === true,
    outstanding: toNumber(row['outstanding_principal']),
    daysOverdue: toNumber(row['days_overdue']),
    outstanding12mAgo: toNumber(row['outstanding_12m_ago']),
    writtenOff12m: toNumber(row['written_off_12m']),
    recovered12m: toNumber(row['recovered_12m'])
  }));
}

/** Form 1 loan line for a loan: restructured first, then by original term. */
export function loanTermLine(loan: LoanRow): string {
  if (loan.restructured) {
    return '1.5';
  }
  if (loan.termMonths <= 0) {
    return '1.4';
  }
  if (loan.termMonths <= SHORT_TERM_MAX_MONTHS) {
    return '1.1';
  }
  return loan.termMonths <= MEDIUM_TERM_MAX_MONTHS ? '1.2' : '1.3';
}

/** Form 3 class for a number of days overdue. */
export function loanClass(daysOverdue: number): (typeof FORM3_CLASSES)[number] {
  return FORM3_CLASSES.find((c) => daysOverdue <= c.maxDays) || FORM3_CLASSES[FORM3_CLASSES.length - 1];
}

/** Balance with debits positive (assets and expenses carry their natural sign this way). */
function debitSigned(row: BalanceRow): number {
  return row.accountType === ASSET || row.accountType === EXPENSE ? row.closingBalance : -row.closingBalance;
}

/** Effect of the period's movement on profit: income movement adds, expense movement subtracts. */
function profitEffect(row: BalanceRow): number {
  const movement = row.closingBalance - row.openingBalance;
  if (row.accountType === INCOME) {
    return movement;
  }
  return row.accountType === EXPENSE ? -movement : 0;
}

/** Tag "F1-3.1" → "3.1"; null when the tag is for another form or has no line number. */
function tagLine(reportLine: string, form: number): string | null {
  const match = /^F(\d)-(\d+\.\d+)$/.exec(reportLine || '');
  return match && Number(match[1]) === form ? match[2] : null;
}

/** Fills totals from their component lines, in form order. */
function computeTotals(form: FormLine[], values: Map<string, number>): void {
  form
    .filter((f) => f.sum)
    .forEach((f) => {
      const total = f.sum.reduce((acc, ref) => {
        const negative = ref.startsWith('-');
        const value = values.get(negative ? ref.substring(1) : ref) || 0;
        return acc + (negative ? -value : value);
      }, 0);
      values.set(f.line, round2(total));
    });
}

function check(label: string, left: number, right: number): StatementCheck {
  const difference = round2(left - right);
  return { label, ok: difference === 0, difference };
}

function formLines(form: FormLine[], valueColumns: Map<string, number>[], t: Translate): StatementLine[] {
  return form.map((f): StatementLine => {
    const kind =
      f.kind === 'heading' ? 'section' : f.kind === 'item' ? 'account' : f.kind === 'total' ? 'total' : 'grand-total';
    return {
      kind,
      texts: [
        f.line,
        f.manual ? `${f.label} ${t('tcdc.manual')}` : f.label
      ],
      values: valueColumns.map((values) => (f.kind === 'heading' || f.manual ? null : values.get(f.line) || 0))
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Builders

/**
 * Form 1: Statement of Financial Position.
 * @param balances "TZ GL Balances" from the first day of the financial year to the reporting date.
 * @param loans "TZ Loan Portfolio" as at the reporting date.
 */
export function buildTcdcForm1(balances: BalanceRow[], loans: LoanRow[], t: Translate): Statement {
  const values = new Map<string, number>();
  const add = (line: string, amount: number) => values.set(line, round2((values.get(line) || 0) + amount));
  const unplaced: string[] = [];

  balances.forEach((row) => {
    if (row.accountType === INCOME || row.accountType === EXPENSE) {
      return;
    }
    const line = tagLine(row.reportLine, 1);
    const section = tagSection(row.reportLine);
    if (section && section.form === 1 && section.section === 1 && line !== '1.7') {
      return; // loan principal comes from the loan records (lines 1.1-1.6)
    }
    if (!line || !FORM1.some((f) => f.line === line && f.kind === 'item')) {
      if (row.closingBalance !== 0) {
        unplaced.push(row.glCode);
      }
      return;
    }
    // Asset sections 1-5 are debit balances; liabilities and equity (7-10) are credit balances.
    add(line, Number(line.split('.')[0]) <= 5 ? debitSigned(row) : -debitSigned(row));
  });

  loans.filter((loan) => loan.outstanding > 0).forEach((loan) => add(loanTermLine(loan), loan.outstanding));

  // Income less expenses before the start of the year has not been transferred: it belongs to past years.
  const priorResult = balances.reduce(
    (acc, row) =>
      acc + (row.accountType === INCOME ? row.openingBalance : row.accountType === EXPENSE ? -row.openingBalance : 0),
    0
  );
  const yearResult = balances.reduce((acc, row) => acc + profitEffect(row), 0);
  add('10.8', priorResult);
  add('10.9', yearResult);
  computeTotals(FORM1, values);

  const loanLines = round2(
    [
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5',
      '1.6'
    ].reduce((acc, l) => acc + (values.get(l) || 0), 0)
  );
  const loanGl = round2(
    balances
      .filter((row) => row.reportLine === 'F1-1' || /^F1-1\.[1-6]$/.test(row.reportLine))
      .reduce((acc, row) => acc + debitSigned(row), 0)
  );
  const glAssets = round2(
    balances.filter((row) => row.accountType === ASSET).reduce((acc, row) => acc + row.closingBalance, 0)
  );

  return {
    kind: 'tcdc-form-1',
    title: t('title.tcdcForm1'),
    textColumns: [
      t('col.line'),
      t('col.item')
    ],
    numericColumns: [t('col.amountTzs')],
    lines: formLines(FORM1, [values], t),
    checks: [
      check(t('check.tcdcAssetsBalance'), values.get('6') || 0, values.get('11') || 0),
      check(t('check.tcdcLoansGl'), loanLines, loanGl),
      check(t('check.tcdcAssetsGl'), values.get('6') || 0, glAssets)
    ],
    untaggedAccounts: unplaced
  };
}

function form2Values(balances: BalanceRow[], unplaced: Set<string>): Map<string, number> {
  const values = new Map<string, number>();
  balances.forEach((row) => {
    if (row.accountType !== INCOME && row.accountType !== EXPENSE) {
      return;
    }
    const effect = profitEffect(row);
    if (effect === 0) {
      return;
    }
    const line = tagLine(row.reportLine, 2);
    if (!line || !FORM2.some((f) => f.line === line && f.kind === 'item' && !f.manual)) {
      unplaced.add(row.glCode);
      return;
    }
    const amount = FORM2_EXPENSE_LINES.has(line) ? -effect : effect;
    values.set(line, round2((values.get(line) || 0) + amount));
  });
  computeTotals(FORM2, values);
  return values;
}

/**
 * Form 2: Statement of Comprehensive Income, quarter to date and year to date.
 * @param quarter "TZ GL Balances" from the first day of the quarter to the reporting date.
 * @param year "TZ GL Balances" from the first day of the financial year to the reporting date.
 */
export function buildTcdcForm2(quarter: BalanceRow[], year: BalanceRow[], t: Translate): Statement {
  const unplaced = new Set<string>();
  const q = form2Values(quarter, unplaced);
  const y = form2Values(year, unplaced);
  const result = (rows: BalanceRow[]) => round2(rows.reduce((acc, row) => acc + profitEffect(row), 0));
  return {
    kind: 'tcdc-form-2',
    title: t('title.tcdcForm2'),
    textColumns: [
      t('col.item'),
      t('col.description')
    ],
    numericColumns: [
      t('col.quarterToDate'),
      t('col.yearToDate')
    ],
    lines: formLines(
      FORM2,
      [
        q,
        y
      ],
      t
    ),
    checks: [
      check(t('check.tcdcProfitQuarter'), q.get('7.0') || 0, result(quarter)),
      check(t('check.tcdcProfitYear'), y.get('7.0') || 0, result(year))
    ],
    untaggedAccounts: Array.from(unplaced).sort()
  };
}

/**
 * Form 3: Loan Classification and Provisioning.
 * @param loans "TZ Loan Portfolio" as at the reporting date.
 * @param balances "TZ GL Balances" up to the reporting date (for the allowance account, tag F1-1.7, and the loan GL check).
 */
export function buildTcdcForm3(loans: LoanRow[], balances: BalanceRow[], t: Translate): Statement {
  const active = loans.filter((loan) => loan.outstanding > 0);
  const lines: StatementLine[] = [];
  let count = 0;
  let outstanding = 0;
  let provision = 0;

  FORM3_CLASSES.forEach((c) => {
    const members = active.filter((loan) => loanClass(loan.daysOverdue) === c);
    const classOutstanding = round2(members.reduce((acc, loan) => acc + loan.outstanding, 0));
    const classProvision = round2((classOutstanding * c.rate) / 100);
    lines.push({
      kind: 'account',
      texts: [`${c.line} ${c.label}`],
      values: [
        members.length,
        classOutstanding,
        c.rate,
        classProvision
      ]
    });
    count += members.length;
    outstanding = round2(outstanding + classOutstanding);
    provision = round2(provision + classProvision);
  });
  lines.push({
    kind: 'grand-total',
    texts: [`3.5 ${t('tcdc.total')}`],
    values: [
      count,
      outstanding,
      null,
      provision
    ]
  });

  const allowance = round2(
    -balances.filter((row) => row.reportLine === 'F1-1.7').reduce((acc, row) => acc + debitSigned(row), 0)
  );
  const writtenOff = round2(loans.reduce((acc, loan) => acc + loan.writtenOff12m, 0));
  const recovered = round2(loans.reduce((acc, loan) => acc + loan.recovered12m, 0));
  const yearAgo = round2(loans.reduce((acc, loan) => acc + loan.outstanding12mAgo, 0));
  const extra: [
    string,
    number
  ][] = [
    [
      '3.6 Total Allowance Amount required for the Portfolio (total line 3.5, column 5)',
      provision
    ],
    [
      '3.7 Actual Amount in the Allowance for Loan Loss Account (see balance sheet)',
      allowance
    ],
    [
      '3.8 Amount of Adjustment, if necessary (3.6 minus 3.7)',
      round2(provision - allowance)
    ],
    [
      '3.9 Total Amount for last 12 months of Written off Loans',
      writtenOff
    ],
    [
      '3.10 Total Amount for last 12 months of Recoveries on all written off Loans',
      recovered
    ],
    [
      '3.11 Total Gross Loan balance 12 months prior to the date of this report',
      yearAgo
    ]
  ];
  lines.push({ kind: 'section', texts: [t('tcdc.additional')], values: [
      null,
      null,
      null,
      null
    ] });
  extra.forEach(
    ([
      label,
      amount
    ]) =>
      lines.push({ kind: 'account', texts: [label], values: [
          null,
          null,
          null,
          amount
        ] })
  );

  const loanGl = round2(
    balances
      .filter((row) => row.reportLine === 'F1-1' || /^F1-1\.[1-6]$/.test(row.reportLine))
      .reduce((acc, row) => acc + debitSigned(row), 0)
  );

  return {
    kind: 'tcdc-form-3',
    title: t('title.tcdcForm3'),
    textColumns: [t('col.classification')],
    numericColumns: [
      t('col.numberOfLoans'),
      t('col.outstandingBalance'),
      t('col.rate'),
      t('col.provision')
    ],
    columnFormats: [
      'count',
      'amount',
      'percent',
      'amount'
    ],
    lines,
    checks: [check(t('check.tcdcLoansGl'), outstanding, loanGl)],
    untaggedAccounts: []
  };
}

/**
 * First day of the financial quarter that contains the date.
 * @param startMonth Month the financial year starts in, 1 to 12.
 */
export function financialQuarterStart(date: Date, startMonth: number): Date {
  const first = Math.min(Math.max(Math.round(startMonth) || 1, 1), 12) - 1;
  const monthsIntoYear = (date.getMonth() - first + 12) % 12;
  // Step back to the first month of the quarter; Date handles a negative month by going into the previous year.
  return new Date(date.getFullYear(), date.getMonth() - (monthsIntoYear % 3), 1);
}
