/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** Names of the reports registered in Fineract (Phase 3, Step 4). */
export const REPORT_GL_BALANCES = 'TZ GL Balances';
export const REPORT_GL_ACCOUNT_TRANSACTIONS = 'TZ GL Account Transactions';
export const REPORT_CASH_FLOW = 'TZ Cash Flow';
/** Phase 4: loan records behind TCDC Forms 1 and 3. */
export const REPORT_LOAN_PORTFOLIO = 'TZ Loan Portfolio';

/** Statements the screen can produce. */
export type StatementKind =
  | 'trial-balance'
  | 'balance-sheet'
  | 'income-statement'
  | 'changes-in-equity'
  | 'cash-flow'
  | 'general-ledger'
  | 'tcdc-form-1'
  | 'tcdc-form-2'
  | 'tcdc-form-3';

export const STATEMENT_KINDS: StatementKind[] = [
  'trial-balance',
  'balance-sheet',
  'income-statement',
  'changes-in-equity',
  'cash-flow',
  'general-ledger'
];

/** TCDC off-site returns (Phase 4). */
export const TCDC_KINDS: StatementKind[] = [
  'tcdc-form-1',
  'tcdc-form-2',
  'tcdc-form-3'
];

/** Statements worked out as at one date (no start date to choose). */
export const AS_AT_KINDS: StatementKind[] = [
  'balance-sheet',
  ...TCDC_KINDS
];

/** One row of the "TZ Loan Portfolio" report. */
export interface LoanRow {
  loanId: number;
  accountNo: string;
  productName: string;
  /** Original contractual term in months. */
  termMonths: number;
  restructured: boolean;
  /** Outstanding principal as at the reporting date. */
  outstanding: number;
  daysOverdue: number;
  outstanding12mAgo: number;
  writtenOff12m: number;
  recovered12m: number;
}

/** How a numeric column is shown: an amount (default), a count, or a percentage. */
export type ColumnFormat = 'amount' | 'count' | 'percent';

/** Fineract GL account types. */
export const ASSET = 1;
export const LIABILITY = 2;
export const EQUITY = 3;
export const INCOME = 4;
export const EXPENSE = 5;

/** One row of the "TZ GL Balances" report. */
export interface BalanceRow {
  glCode: string;
  accountName: string;
  accountType: number;
  accountId: number;
  /** TCDC line tag, for example F1-3.1. Empty when the account is not tagged. */
  reportLine: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
}

/** One row of the "TZ Cash Flow" report. */
export interface CashFlowRow {
  rowType: 'OPENING' | 'FLOW' | 'CLOSING';
  glCode: string;
  accountName: string;
  accountType: number;
  reportLine: string;
  inflow: number;
  outflow: number;
}

/** One row of the "TZ GL Account Transactions" report. */
export interface LedgerRow {
  /** ISO date, yyyy-MM-dd. */
  entryDate: string;
  transactionId: string;
  description: string;
  counterAccounts: string;
  officeName: string;
  entrySource: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

/** How a statement line is drawn. */
export type LineKind = 'section' | 'group' | 'account' | 'subtotal' | 'total' | 'grand-total';

/** One line of a statement: text cells followed by numeric cells. */
export interface StatementLine {
  kind: LineKind;
  /** One entry per text column. */
  texts: string[];
  /** One entry per numeric column. Null leaves the cell empty. */
  values: (number | null)[];
  /** GL account behind the line, when there is exactly one. Enables drill-down. */
  accountId?: number;
  /** Journal transaction behind the line (general ledger only). */
  transactionId?: string;
}

/** A reconciliation shown under the statement, for example "assets = liabilities + equity". */
export interface StatementCheck {
  label: string;
  ok: boolean;
  difference: number;
}

/** A statement ready to draw on screen, in a PDF or in a spreadsheet. */
export interface Statement {
  kind: StatementKind;
  title: string;
  textColumns: string[];
  numericColumns: string[];
  lines: StatementLine[];
  checks: StatementCheck[];
  /** GL codes of accounts with a balance but no TCDC line tag. */
  untaggedAccounts: string[];
  /** One entry per numeric column. Omitted means every column is an amount. */
  columnFormats?: ColumnFormat[];
}

/** Details printed in the header and footer of an exported statement. */
export interface StatementMeta {
  entityName: string;
  officeName: string;
  /** For example "As at 17 November 2026" or "For the period 01 January 2026 to 17 November 2026". */
  periodText: string;
  currencyCode: string;
  preparedBy: string;
  /** For example "Generated 17 November 2026 14:05". */
  generatedText: string;
  /** Signature block labels: prepared by, reviewed by, approved by. */
  signatureLabels: string[];
  /** Labels for the signature lines: name, signature, date. */
  signatureFieldLabels: string[];
  /** Optional logo as a data URL (PNG or JPEG). */
  logoDataUrl?: string;
}

/** Looks up a label by key, in the user's language. */
export type Translate = (key: string) => string;
