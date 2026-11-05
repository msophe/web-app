/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** Settings from `environment.saccoMode` that drive the eligibility figures. */
export interface SaccoEligibilityConfig {
  savingsMultiplier: number;
  mandatorySavingsShortName: string;
  sharePrice: number;
}

/** Advisory loan-eligibility figures for one member. */
export interface SaccoEligibilitySummary {
  currencyCode: string;
  mandatorySavings: number;
  totalSharesValue: number;
  totalActiveLoanBalance: number;
  netLoanEligibility: number;
}

const isActive = (account: any): boolean => account?.status?.active === true;

/** Sum of balances of active savings accounts whose product short name matches the mandatory savings product. */
export function mandatorySavings(savingsAccounts: any[] | undefined, shortName: string): number {
  return (savingsAccounts ?? [])
    .filter((account) => isActive(account) && account.shortProductName === shortName)
    .reduce((sum, account) => sum + Number(account.accountBalance ?? 0), 0);
}

/** Currency of the member's mandatory savings account, defaulting to TZS. */
export function mandatoryCurrencyCode(savingsAccounts: any[] | undefined, shortName: string): string {
  const account = (savingsAccounts ?? []).find((a) => a.shortProductName === shortName);
  return account?.currency?.code ?? 'TZS';
}

/** Value of approved shares held in active share accounts. */
export function totalSharesValue(shareAccounts: any[] | undefined, sharePrice: number): number {
  return (shareAccounts ?? [])
    .filter(isActive)
    .reduce((sum, account) => sum + Number(account.totalApprovedShares ?? 0) * sharePrice, 0);
}

/** Outstanding balance across active loans. */
export function totalActiveLoanBalance(loanAccounts: any[] | undefined): number {
  return (loanAccounts ?? []).filter(isActive).reduce((sum, account) => sum + Number(account.loanBalance ?? 0), 0);
}

/** max(0, mandatory savings × multiplier − active loan balance). */
export function netLoanEligibility(savings: number, loanBalance: number, multiplier: number): number {
  return Math.max(0, savings * multiplier - loanBalance);
}

/** Builds the eligibility summary from a `GET /clients/{id}/accounts` response. */
export function summarizeSaccoEligibility(accounts: any, config: SaccoEligibilityConfig): SaccoEligibilitySummary {
  const savings = mandatorySavings(accounts?.savingsAccounts, config.mandatorySavingsShortName);
  const loanBalance = totalActiveLoanBalance(accounts?.loanAccounts);
  return {
    currencyCode: mandatoryCurrencyCode(accounts?.savingsAccounts, config.mandatorySavingsShortName),
    mandatorySavings: savings,
    totalSharesValue: totalSharesValue(accounts?.shareAccounts, config.sharePrice),
    totalActiveLoanBalance: loanBalance,
    netLoanEligibility: netLoanEligibility(savings, loanBalance, config.savingsMultiplier)
  };
}
