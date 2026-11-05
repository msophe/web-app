/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { summarizeSaccoEligibility } from './sacco-eligibility';

const config = { savingsMultiplier: 3, mandatorySavingsShortName: 'AKBL', sharePrice: 10000 };
const active = { active: true };
const closed = { active: false, closed: true };

describe('summarizeSaccoEligibility', () => {
  it('should give 3x mandatory savings when the member has no loans or shares', () => {
    const summary = summarizeSaccoEligibility(
      {
        savingsAccounts: [
          { shortProductName: 'AKBL', status: active, accountBalance: 500000, currency: { code: 'TZS' } }
        ]
      },
      config
    );
    expect(summary).toEqual({
      currencyCode: 'TZS',
      mandatorySavings: 500000,
      totalSharesValue: 0,
      totalActiveLoanBalance: 0,
      netLoanEligibility: 1500000
    });
  });

  it('should ignore voluntary savings and closed accounts', () => {
    const summary = summarizeSaccoEligibility(
      {
        savingsAccounts: [
          { shortProductName: 'AKBL', status: active, accountBalance: 500000 },
          { shortProductName: 'AKBL', status: closed, accountBalance: 900000 },
          { shortProductName: 'VOL', status: active, accountBalance: 2000000 }
        ],
        loanAccounts: [{ status: closed, loanBalance: 0 }]
      },
      config
    );
    expect(summary.mandatorySavings).toBe(500000);
    expect(summary.netLoanEligibility).toBe(1500000);
  });

  it('should subtract active loan balances and floor at zero', () => {
    const summary = summarizeSaccoEligibility(
      {
        savingsAccounts: [{ shortProductName: 'AKBL', status: active, accountBalance: 500000 }],
        loanAccounts: [{ status: active, loanBalance: 1650241 }]
      },
      config
    );
    expect(summary.totalActiveLoanBalance).toBe(1650241);
    expect(summary.netLoanEligibility).toBe(0);
  });

  it('should value approved shares in active share accounts at the share price', () => {
    const summary = summarizeSaccoEligibility(
      {
        shareAccounts: [
          { status: active, totalApprovedShares: 25, totalPendingForApprovalShares: 5 },
          { status: closed, totalApprovedShares: 10 }
        ]
      },
      config
    );
    expect(summary.totalSharesValue).toBe(250000);
  });

  it('should tolerate a response with no account collections', () => {
    expect(summarizeSaccoEligibility({}, config).netLoanEligibility).toBe(0);
  });
});
