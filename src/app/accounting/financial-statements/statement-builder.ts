/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Turns the rows returned by the Phase 3 Fineract reports into statements.
 *
 * Everything here is plain TypeScript with no Angular dependency, so the
 * arithmetic can be unit tested on its own.
 */

import {
  ASSET,
  BalanceRow,
  ColumnFormat,
  CashFlowRow,
  EQUITY,
  EXPENSE,
  INCOME,
  LedgerRow,
  LIABILITY,
  Statement,
  StatementCheck,
  StatementLine,
  Translate
} from './financial-statements.model';

/** Balance sheet groups, keyed by TCDC Form 1 section number. */
const BALANCE_SHEET_GROUPS: { [section: number]: string } = {
  1: 'group.loans',
  2: 'group.investments',
  3: 'group.cash',
  4: 'group.fixedAssets',
  5: 'group.otherAssets',
  7: 'group.borrowings',
  8: 'group.deposits',
  9: 'group.otherLiabilities',
  10: 'group.equity'
};

/** Income statement groups, keyed by TCDC Form 2 section number. */
const INCOME_STATEMENT_GROUPS: { [section: number]: string } = {
  1: 'group.interestIncome',
  2: 'group.interestExpense',
  3: 'group.nonInterestIncome',
  4: 'group.operatingExpenses',
  5: 'group.provisions',
  6: 'group.extraordinary'
};

/** Group number used for accounts that carry no usable TCDC line tag. */
const UNCLASSIFIED = 999;

/** Rounds to two decimals so that sums of amounts do not drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function toNumber(value: any): number {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/** Fineract sends dates as [year, month, day]; some builds send a string. Returns yyyy-MM-dd. */
function toIsoDate(value: any): string {
  if (Array.isArray(value) && value.length >= 3) {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value[0]}-${pad(value[1])}-${pad(value[2])}`;
  }
  return value ? String(value).substring(0, 10) : '';
}

/**
 * Reads the TCDC form and section out of a line tag.
 * "F1-3.1" gives form 1, section 3. "F1-1" gives form 1, section 1.
 */
export function tagSection(reportLine: string): { form: number; section: number } | null {
  const match = /^F(\d)-(\d+)(?:\.\d+)?$/.exec(reportLine || '');
  return match ? { form: Number(match[1]), section: Number(match[2]) } : null;
}

/**
 * Converts a Fineract generic result set ({ columnHeaders, data: [{ row }] }) into objects keyed by column name.
 */
export function parseResultSet(response: any): { [column: string]: any }[] {
  const columns: string[] = (response?.columnHeaders || []).map((header: any) => header.columnName);
  return (response?.data || []).map((entry: any) => {
    const record: { [column: string]: any } = {};
    columns.forEach((column, index) => (record[column] = entry.row[index]));
    return record;
  });
}

export function toBalanceRows(response: any): BalanceRow[] {
  return parseResultSet(response).map((row) => ({
    glCode: String(row['gl_code'] ?? ''),
    accountName: String(row['account_name'] ?? ''),
    accountType: toNumber(row['account_type']),
    accountId: toNumber(row['account_id']),
    reportLine: String(row['report_line'] ?? ''),
    openingBalance: toNumber(row['opening_balance']),
    periodDebit: toNumber(row['period_debit']),
    periodCredit: toNumber(row['period_credit']),
    closingBalance: toNumber(row['closing_balance'])
  }));
}

export function toCashFlowRows(response: any): CashFlowRow[] {
  return parseResultSet(response).map((row) => ({
    rowType: row['row_type'],
    glCode: String(row['gl_code'] ?? ''),
    accountName: String(row['account_name'] ?? ''),
    accountType: toNumber(row['account_type']),
    reportLine: String(row['report_line'] ?? ''),
    inflow: toNumber(row['inflow']),
    outflow: toNumber(row['outflow'])
  }));
}

export function toLedgerRows(response: any): LedgerRow[] {
  return parseResultSet(response).map((row) => ({
    entryDate: toIsoDate(row['entry_date']),
    transactionId: String(row['transaction_id'] ?? ''),
    description: String(row['description'] ?? ''),
    counterAccounts: String(row['counter_accounts'] ?? ''),
    officeName: String(row['office_name'] ?? ''),
    entrySource: String(row['entry_source'] ?? ''),
    debit: toNumber(row['debit']),
    credit: toNumber(row['credit']),
    runningBalance: toNumber(row['running_balance'])
  }));
}

/** True when the account has a balance or any posting in the period. */
function hasActivity(row: BalanceRow): boolean {
  return row.openingBalance !== 0 || row.closingBalance !== 0 || row.periodDebit !== 0 || row.periodCredit !== 0;
}

/** Movement over the period in the account's natural sign (closing less opening). */
function movement(row: BalanceRow): number {
  return round2(row.closingBalance - row.openingBalance);
}

/** GL codes of accounts that carry a balance or postings but no TCDC line tag. */
function findUntagged(rows: BalanceRow[]): string[] {
  return rows.filter((row) => hasActivity(row) && !tagSection(row.reportLine)).map((row) => row.glCode);
}

function check(label: string, left: number, right: number): StatementCheck {
  const difference = round2(left - right);
  return { label, ok: difference === 0, difference };
}

/** Income less expenses, as an opening figure and as the movement over the period. */
function resultOf(rows: BalanceRow[]): { opening: number; period: number } {
  const income = rows.filter((row) => row.accountType === INCOME);
  const expenses = rows.filter((row) => row.accountType === EXPENSE);
  return {
    opening: round2(sum(income.map((r) => r.openingBalance)) - sum(expenses.map((r) => r.openingBalance))),
    period: round2(sum(income.map(movement)) - sum(expenses.map(movement)))
  };
}

/**
 * Groups rows by their TCDC section and emits group heading, account lines and a group total.
 * Returns the lines and the total of all groups.
 */
function groupedLines(
  rows: BalanceRow[],
  form: number,
  groupLabels: { [section: number]: string },
  amountOf: (row: BalanceRow) => number,
  showZero: boolean,
  t: Translate
): { lines: StatementLine[]; total: number } {
  const groups = new Map<number, BalanceRow[]>();
  rows
    .filter((row) => showZero || amountOf(row) !== 0)
    .forEach((row) => {
      const tag = tagSection(row.reportLine);
      const section = tag && tag.form === form && groupLabels[tag.section] ? tag.section : UNCLASSIFIED;
      groups.set(section, [
        ...(groups.get(section) || []),
        row
      ]);
    });

  const lines: StatementLine[] = [];
  let total = 0;
  Array.from(groups.keys())
    .sort((a, b) => a - b)
    .forEach((section) => {
      const members = groups.get(section).sort((a, b) => a.glCode.localeCompare(b.glCode));
      const label = t(section === UNCLASSIFIED ? 'group.unclassified' : groupLabels[section]);
      const groupTotal = sum(members.map(amountOf));
      lines.push({
        kind: 'group',
        texts: [
          '',
          label
        ],
        values: [null]
      });
      members.forEach((row) =>
        lines.push({
          kind: 'account',
          texts: [
            row.glCode,
            row.accountName
          ],
          values: [amountOf(row)],
          accountId: row.accountId
        })
      );
      if (members.length > 1) {
        lines.push({
          kind: 'subtotal',
          texts: [
            '',
            `${t('line.totalOf')} ${lowerFirst(label)}`
          ],
          values: [groupTotal]
        });
      }
      total = round2(total + groupTotal);
    });
  return { lines, total };
}

function sectionLine(label: string, numericColumns: number): StatementLine {
  return {
    kind: 'section',
    texts: [
      '',
      label
    ],
    values: new Array(numericColumns).fill(null)
  };
}

/**
 * Trial balance: period postings and closing balances for every account.
 */
export function buildTrialBalance(rows: BalanceRow[], t: Translate, showZero = false): Statement {
  const lines: StatementLine[] = [];
  let periodDebit = 0;
  let periodCredit = 0;
  let closingDebit = 0;
  let closingCredit = 0;

  rows
    .filter((row) => showZero || hasActivity(row))
    .sort((a, b) => a.glCode.localeCompare(b.glCode))
    .forEach((row) => {
      // Assets and expenses carry debit balances; the rest carry credit balances.
      const debitSigned =
        row.accountType === ASSET || row.accountType === EXPENSE ? row.closingBalance : -row.closingBalance;
      const debit = debitSigned > 0 ? debitSigned : null;
      const credit = debitSigned < 0 ? -debitSigned : null;
      lines.push({
        kind: 'account',
        texts: [
          row.glCode,
          row.accountName
        ],
        values: [
          row.periodDebit || null,
          row.periodCredit || null,
          debit,
          credit
        ],
        accountId: row.accountId
      });
      periodDebit += row.periodDebit;
      periodCredit += row.periodCredit;
      closingDebit += debit || 0;
      closingCredit += credit || 0;
    });

  lines.push({
    kind: 'grand-total',
    texts: [
      '',
      t('line.total')
    ],
    values: [
      round2(periodDebit),
      round2(periodCredit),
      round2(closingDebit),
      round2(closingCredit)
    ]
  });

  return {
    kind: 'trial-balance',
    title: t('title.trialBalance'),
    textColumns: [
      t('col.code'),
      t('col.account')
    ],
    numericColumns: [
      t('col.periodDebit'),
      t('col.periodCredit'),
      t('col.closingDebit'),
      t('col.closingCredit')
    ],
    lines,
    checks: [check(t('check.trialBalance'), round2(closingDebit), round2(closingCredit))],
    untaggedAccounts: findUntagged(rows)
  };
}

/**
 * Statement of financial position as at the end date.
 * The rows must come from a run whose start date is the first day of the financial year,
 * so that the result can be split into earlier years and the year to date.
 */
export function buildBalanceSheet(rows: BalanceRow[], t: Translate, showZero = false): Statement {
  const closing = (row: BalanceRow) => row.closingBalance;
  const assets = groupedLines(
    rows.filter((row) => row.accountType === ASSET),
    1,
    BALANCE_SHEET_GROUPS,
    closing,
    showZero,
    t
  );
  const liabilities = groupedLines(
    rows.filter((row) => row.accountType === LIABILITY),
    1,
    BALANCE_SHEET_GROUPS,
    closing,
    showZero,
    t
  );
  const equityRows = rows
    .filter((row) => row.accountType === EQUITY && (showZero || row.closingBalance !== 0))
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const result = resultOf(rows);
  const totalEquity = round2(sum(equityRows.map(closing)) + result.opening + result.period);

  const lines: StatementLine[] = [
    sectionLine(t('section.assets'), 1),
    ...assets.lines,
    {
      kind: 'total',
      texts: [
        '',
        t('line.totalAssets')
      ],
      values: [assets.total]
    },
    sectionLine(t('section.liabilities'), 1),
    ...liabilities.lines,
    {
      kind: 'total',
      texts: [
        '',
        t('line.totalLiabilities')
      ],
      values: [liabilities.total]
    },
    sectionLine(t('section.equity'), 1),
    ...equityRows.map((row): StatementLine => ({
      kind: 'account',
      texts: [
        row.glCode,
        row.accountName
      ],
      values: [row.closingBalance],
      accountId: row.accountId
    }))
  ];
  if (result.opening !== 0) {
    lines.push({
      kind: 'account',
      texts: [
        '',
        t('line.priorYearsResult')
      ],
      values: [result.opening]
    });
  }
  lines.push(
    {
      kind: 'account',
      texts: [
        '',
        t('line.currentYearResult')
      ],
      values: [result.period]
    },
    {
      kind: 'total',
      texts: [
        '',
        t('line.totalEquity')
      ],
      values: [totalEquity]
    },
    {
      kind: 'grand-total',
      texts: [
        '',
        t('line.totalLiabilitiesAndEquity')
      ],
      values: [round2(liabilities.total + totalEquity)]
    }
  );

  return {
    kind: 'balance-sheet',
    title: t('title.balanceSheet'),
    textColumns: [
      t('col.code'),
      t('col.account')
    ],
    numericColumns: [t('col.amount')],
    lines,
    checks: [check(t('check.balanceSheet'), assets.total, round2(liabilities.total + totalEquity))],
    untaggedAccounts: findUntagged(rows)
  };
}

/**
 * Income statement for the period between the start and end dates.
 */
export function buildIncomeStatement(rows: BalanceRow[], t: Translate, showZero = false): Statement {
  const income = groupedLines(
    rows.filter((row) => row.accountType === INCOME),
    2,
    INCOME_STATEMENT_GROUPS,
    movement,
    showZero,
    t
  );
  const expenses = groupedLines(
    rows.filter((row) => row.accountType === EXPENSE),
    2,
    INCOME_STATEMENT_GROUPS,
    movement,
    showZero,
    t
  );

  const lines: StatementLine[] = [
    sectionLine(t('section.income'), 1),
    ...income.lines,
    {
      kind: 'total',
      texts: [
        '',
        t('line.totalIncome')
      ],
      values: [income.total]
    },
    sectionLine(t('section.expenses'), 1),
    ...expenses.lines,
    {
      kind: 'total',
      texts: [
        '',
        t('line.totalExpenses')
      ],
      values: [expenses.total]
    },
    {
      kind: 'grand-total',
      texts: [
        '',
        t('line.periodResult')
      ],
      values: [round2(income.total - expenses.total)]
    }
  ];

  return {
    kind: 'income-statement',
    title: t('title.incomeStatement'),
    textColumns: [
      t('col.code'),
      t('col.account')
    ],
    numericColumns: [t('col.amount')],
    lines,
    checks: [],
    untaggedAccounts: findUntagged(rows.filter((row) => row.accountType === INCOME || row.accountType === EXPENSE))
  };
}

/**
 * Statement of changes in equity for the period between the start and end dates.
 */
export function buildChangesInEquity(rows: BalanceRow[], t: Translate, showZero = false): Statement {
  const equityRows = rows
    .filter((row) => row.accountType === EQUITY && (showZero || hasActivity(row)))
    .sort((a, b) => a.glCode.localeCompare(b.glCode));
  const result = resultOf(rows);

  const lines: StatementLine[] = equityRows.map((row): StatementLine => ({
    kind: 'account',
    texts: [
      row.glCode,
      row.accountName
    ],
    values: [
      row.openingBalance,
      row.periodCredit || null,
      row.periodDebit || null,
      row.closingBalance
    ],
    accountId: row.accountId
  }));
  lines.push({
    kind: 'account',
    texts: [
      '',
      t('line.accumulatedResult')
    ],
    values: [
      result.opening,
      result.period > 0 ? result.period : null,
      result.period < 0 ? -result.period : null,
      round2(result.opening + result.period)
    ]
  });

  const opening = round2(sum(equityRows.map((row) => row.openingBalance)) + result.opening);
  const increases = round2(sum(equityRows.map((row) => row.periodCredit)) + Math.max(result.period, 0));
  const decreases = round2(sum(equityRows.map((row) => row.periodDebit)) + Math.max(-result.period, 0));
  const closing = round2(sum(equityRows.map((row) => row.closingBalance)) + result.opening + result.period);
  lines.push({
    kind: 'grand-total',
    texts: [
      '',
      t('line.totalEquity')
    ],
    values: [
      opening,
      increases,
      decreases,
      closing
    ]
  });

  const netAssets = round2(
    sum(rows.filter((row) => row.accountType === ASSET).map((row) => row.closingBalance)) -
      sum(rows.filter((row) => row.accountType === LIABILITY).map((row) => row.closingBalance))
  );

  return {
    kind: 'changes-in-equity',
    title: t('title.changesInEquity'),
    textColumns: [
      t('col.code'),
      t('col.account')
    ],
    numericColumns: [
      t('col.opening'),
      t('col.increases'),
      t('col.decreases'),
      t('col.closing')
    ],
    lines,
    checks: [check(t('check.equity'), closing, netAssets)],
    untaggedAccounts: []
  };
}

/** Cash flow category of a counter account, from its TCDC line tag. */
function cashFlowCategory(reportLine: string): 'operating' | 'investing' | 'financing' {
  const tag = tagSection(reportLine);
  if (tag && tag.form === 1) {
    if (tag.section === 2 || tag.section === 4) {
      return 'investing';
    }
    if (tag.section === 7 || tag.section === 10) {
      return 'financing';
    }
  }
  return 'operating';
}

/**
 * Cash flow statement (direct method): cash received and paid, by the account on the other side of each entry.
 */
export function buildCashFlow(rows: CashFlowRow[], t: Translate): Statement {
  const flows = rows.filter((row) => row.rowType === 'FLOW');
  const opening = sum(rows.filter((row) => row.rowType === 'OPENING').map((row) => row.inflow));
  const closing = sum(rows.filter((row) => row.rowType === 'CLOSING').map((row) => row.inflow));
  const lines: StatementLine[] = [];
  let netChange = 0;

  const categories: {
    key: 'operating' | 'investing' | 'financing';
    section: string;
    total: string;
  }[] = [
    { key: 'operating', section: 'section.operating', total: 'line.netOperating' },
    { key: 'investing', section: 'section.investing', total: 'line.netInvesting' },
    { key: 'financing', section: 'section.financing', total: 'line.netFinancing' }
  ];
  categories.forEach((category) => {
    const members = flows
      .filter((row) => cashFlowCategory(row.reportLine) === category.key)
      .sort((a, b) => a.glCode.localeCompare(b.glCode));
    if (!members.length) {
      return;
    }
    lines.push(sectionLine(t(category.section), 3));
    members.forEach((row) =>
      lines.push({
        kind: 'account',
        texts: [
          row.glCode,
          row.accountName
        ],
        values: [
          row.inflow || null,
          row.outflow || null,
          round2(row.inflow - row.outflow)
        ]
      })
    );
    const received = sum(members.map((row) => row.inflow));
    const paid = sum(members.map((row) => row.outflow));
    lines.push({
      kind: 'total',
      texts: [
        '',
        t(category.total)
      ],
      values: [
        received,
        paid,
        round2(received - paid)
      ]
    });
    netChange = round2(netChange + received - paid);
  });

  lines.push(
    {
      kind: 'grand-total',
      texts: [
        '',
        t('line.netCashChange')
      ],
      values: [
        null,
        null,
        netChange
      ]
    },
    {
      kind: 'account',
      texts: [
        '',
        t('line.cashAtStart')
      ],
      values: [
        null,
        null,
        opening
      ]
    },
    {
      kind: 'grand-total',
      texts: [
        '',
        t('line.cashAtEnd')
      ],
      values: [
        null,
        null,
        closing
      ]
    }
  );

  return {
    kind: 'cash-flow',
    title: t('title.cashFlow'),
    textColumns: [
      t('col.code'),
      t('col.account')
    ],
    numericColumns: [
      t('col.received'),
      t('col.paid'),
      t('col.net')
    ],
    lines,
    checks: [check(t('check.cashFlow'), round2(opening + netChange), closing)],
    untaggedAccounts: flows.filter((row) => !tagSection(row.reportLine)).map((row) => row.glCode)
  };
}

/**
 * General ledger for one account: opening balance, each entry with a running balance, and totals.
 */
export function buildGeneralLedger(
  rows: LedgerRow[],
  accountLabel: string,
  t: Translate,
  formatDate: (isoDate: string) => string = (isoDate) => isoDate
): Statement {
  const lines: StatementLine[] = [];
  const entries = rows.slice(1);
  if (rows.length) {
    lines.push({
      kind: 'subtotal',
      texts: [
        formatDate(rows[0].entryDate),
        '',
        t('line.openingBalance'),
        ''
      ],
      values: [
        null,
        null,
        rows[0].runningBalance
      ]
    });
  }
  entries.forEach((row) =>
    lines.push({
      kind: 'account',
      texts: [
        formatDate(row.entryDate),
        row.transactionId,
        row.description,
        row.counterAccounts
      ],
      values: [
        row.debit || null,
        row.credit || null,
        row.runningBalance
      ],
      transactionId: row.transactionId
    })
  );
  lines.push({
    kind: 'grand-total',
    texts: [
      '',
      '',
      t('line.closingBalance'),
      ''
    ],
    values: [
      sum(entries.map((row) => row.debit)),
      sum(entries.map((row) => row.credit)),
      rows.length ? rows[rows.length - 1].runningBalance : 0
    ]
  });

  return {
    kind: 'general-ledger',
    title: `${t('title.generalLedger')}: ${accountLabel}`,
    textColumns: [
      t('col.date'),
      t('col.transaction'),
      t('col.description'),
      t('col.counterAccounts')
    ],
    numericColumns: [
      t('col.debit'),
      t('col.credit'),
      t('col.balance')
    ],
    lines,
    checks: [],
    untaggedAccounts: []
  };
}

/**
 * First day of the financial year that contains the given date.
 * @param date Any date.
 * @param startMonth Month the financial year starts in, 1 (January) to 12.
 */
export function financialYearStart(date: Date, startMonth: number): Date {
  const month = Math.min(Math.max(Math.round(startMonth) || 1, 1), 12) - 1;
  const year = date.getMonth() >= month ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(year, month, 1);
}

/**
 * Formats a numeric cell according to its column format.
 */
export function formatValue(value: number | null | undefined, format: ColumnFormat = 'amount'): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (format === 'count') {
    return Math.round(value).toLocaleString('en-US');
  }
  if (format === 'percent') {
    return `${round2(value)}%`;
  }
  return formatAmount(value);
}

/**
 * Formats an amount for a statement: thousands separators, brackets for negatives, a dash for zero.
 */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const rounded = round2(value);
  if (rounded === 0) {
    return '-';
  }
  const text = Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2
  });
  return rounded < 0 ? `(${text})` : text;
}
