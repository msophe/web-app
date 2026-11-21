/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  BalanceRow,
  CashFlowRow,
  LedgerRow,
  LoanRow,
  REPORT_CASH_FLOW,
  REPORT_LOAN_PORTFOLIO,
  REPORT_GL_ACCOUNT_TRANSACTIONS,
  REPORT_GL_BALANCES
} from './financial-statements.model';
import { toBalanceRows, toCashFlowRows, toLedgerRows } from './statement-builder';
import { toLoanRows } from './tcdc-forms';

/**
 * Runs the Phase 3 reports registered in Fineract. Dates are sent as yyyy-MM-dd, the format Fineract
 * expects for table reports.
 */
@Injectable({ providedIn: 'root' })
export class FinancialStatementsService {
  private http = inject(HttpClient);

  private run(reportName: string, params: { [key: string]: string | number }): Observable<any> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(
      ([
        key,
        value
      ]) => (httpParams = httpParams.set(`R_${key}`, String(value)))
    );
    return this.http.get(`/runreports/${encodeURIComponent(reportName)}`, { params: httpParams });
  }

  getBalances(officeId: number, startDate: string, endDate: string): Observable<BalanceRow[]> {
    return this.run(REPORT_GL_BALANCES, { officeId, startDate, endDate }).pipe(map(toBalanceRows));
  }

  getCashFlow(officeId: number, startDate: string, endDate: string): Observable<CashFlowRow[]> {
    return this.run(REPORT_CASH_FLOW, { officeId, startDate, endDate }).pipe(map(toCashFlowRows));
  }

  getLedger(officeId: number, glAccountId: number, startDate: string, endDate: string): Observable<LedgerRow[]> {
    return this.run(REPORT_GL_ACCOUNT_TRANSACTIONS, {
      officeId,
      startDate,
      endDate,
      GLAccountNO: glAccountId
    }).pipe(map(toLedgerRows));
  }

  /** Loan records as at the date (Phase 4, TCDC Forms 1 and 3). */
  getLoanPortfolio(officeId: number, endDate: string): Observable<LoanRow[]> {
    return this.run(REPORT_LOAN_PORTFOLIO, { officeId, endDate }).pipe(map(toLoanRows));
  }

  getOffices(): Observable<any[]> {
    return this.http.get<any[]>('/offices', { params: new HttpParams().set('orderBy', 'id') });
  }

  /** Detail (posting) GL accounts only, sorted by code. */
  getPostingAccounts(): Observable<any[]> {
    return this.http
      .get<any[]>('/glaccounts', { params: new HttpParams().set('usage', '1') })
      .pipe(map((accounts) => [...accounts].sort((a, b) => String(a.glCode).localeCompare(String(b.glCode)))));
  }
}
