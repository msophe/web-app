/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatProgressBar } from '@angular/material/progress-bar';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { finalize } from 'rxjs/operators';

import { STANDALONE_SHARED_IMPORTS } from 'app/standalone-shared.module';
import { SettingsService } from 'app/settings/settings.service';
import { AuthenticationService } from 'app/core/authentication/authentication.service';
import { Dates } from 'app/core/utils/dates';
import { environment } from 'environments/environment';

import { FinancialStatementsService } from './financial-statements.service';
import { statementLabels } from './financial-statements.labels';
import { STATEMENT_KINDS, Statement, StatementKind, StatementLine, StatementMeta } from './financial-statements.model';
import {
  buildBalanceSheet,
  buildCashFlow,
  buildChangesInEquity,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
  financialYearStart,
  formatAmount
} from './statement-builder';
import { exportStatementExcel, exportStatementPdf } from './statement-export';

/** Optional settings read from environment.saccoMode (Phase 3, Step 7). */
const SACCO: any = (environment as any).saccoMode || {};

/**
 * Financial Statements: trial balance, balance sheet, income statement, changes in equity,
 * cash flow and general ledger, on screen and as PDF or Excel.
 */
@Component({
  selector: 'mifosx-financial-statements',
  templateUrl: './financial-statements.component.html',
  styleUrls: ['./financial-statements.component.scss'],
  imports: [
    ...STANDALONE_SHARED_IMPORTS,
    MatCheckbox,
    MatProgressBar,
    FaIconComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinancialStatementsComponent implements OnInit {
  private formBuilder = inject(UntypedFormBuilder);
  private service = inject(FinancialStatementsService);
  private settingsService = inject(SettingsService);
  private authenticationService = inject(AuthenticationService);
  private dateUtils = inject(Dates);
  private router = inject(Router);

  readonly kinds = STATEMENT_KINDS;
  readonly t = statementLabels(this.settingsService.language?.code);
  readonly formatAmount = formatAmount;
  readonly fyStartMonth: number = Number(SACCO.financialYearStartMonth) || 1;
  readonly currencyCode: string = SACCO.currencyCode || 'TZS';

  form: UntypedFormGroup;
  offices = signal<any[]>([]);
  accounts = signal<any[]>([]);
  statement = signal<Statement | null>(null);
  loading = signal(false);
  /** Statement shown before a drill-down, so the user can go back. */
  previous = signal<{ statement: Statement; formValue: any } | null>(null);
  /** Period text of the statement on screen, for the header and exports. */
  periodText = signal('');

  kind = signal<StatementKind>('balance-sheet');
  showStartDate = computed(() => this.kind() !== 'balance-sheet');
  showAccount = computed(() => this.kind() === 'general-ledger');

  ngOnInit(): void {
    const today = this.settingsService.businessDate || new Date();
    this.form = this.formBuilder.group({
      kind: [
        'balance-sheet',
        Validators.required
      ],
      officeId: [
        this.authenticationService.getCredentials()?.officeId || 1,
        Validators.required
      ],
      startDate: [financialYearStart(today, this.fyStartMonth)],
      endDate: [
        today,
        Validators.required
      ],
      glAccountId: [null],
      showZero: [false]
    });
    this.form.get('kind').valueChanges.subscribe((kind: StatementKind) => {
      this.kind.set(kind);
      this.statement.set(null);
      this.previous.set(null);
      const account = this.form.get('glAccountId');
      account.setValidators(kind === 'general-ledger' ? [Validators.required] : []);
      account.updateValueAndValidity({ emitEvent: false });
    });
    this.service.getOffices().subscribe((offices) => this.offices.set(offices));
    this.service.getPostingAccounts().subscribe((accounts) => this.accounts.set(accounts));
  }

  private iso(date: Date): string {
    return this.dateUtils.formatDate(date, Dates.DEFAULT_DATEFORMAT);
  }

  private display(date: Date): string {
    return this.dateUtils.formatDate(date, 'dd MMMM yyyy');
  }

  /** Runs the report(s) behind the selected statement and builds it. */
  run(keepPrevious = false): void {
    if (this.form.invalid) {
      return;
    }
    if (!keepPrevious) {
      this.previous.set(null);
    }
    const value = this.form.value;
    const kind: StatementKind = value.kind;
    const end: Date = value.endDate;
    const start: Date = kind === 'balance-sheet' ? financialYearStart(end, this.fyStartMonth) : value.startDate || end;
    const officeId = Number(value.officeId);
    const showZero = !!value.showZero;
    const t = this.t;

    this.periodText.set(
      kind === 'balance-sheet'
        ? `${t('meta.asAt')} ${this.display(end)}`
        : `${t('meta.forPeriod')} ${this.display(start)} ${t('meta.to')} ${this.display(end)}`
    );
    this.loading.set(true);
    this.statement.set(null);

    if (kind === 'cash-flow') {
      this.service
        .getCashFlow(officeId, this.iso(start), this.iso(end))
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe((rows) => this.statement.set(buildCashFlow(rows, t)));
      return;
    }
    if (kind === 'general-ledger') {
      const account = this.accounts().find((a) => a.id === Number(value.glAccountId));
      const label = account ? `${account.glCode} ${account.name}` : String(value.glAccountId);
      this.service
        .getLedger(officeId, Number(value.glAccountId), this.iso(start), this.iso(end))
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe((rows) =>
          this.statement.set(buildGeneralLedger(rows, label, t, (isoDate) => this.display(new Date(isoDate))))
        );
      return;
    }
    this.service
      .getBalances(officeId, this.iso(start), this.iso(end))
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((rows) => {
        const builders = {
          'trial-balance': buildTrialBalance,
          'balance-sheet': buildBalanceSheet,
          'income-statement': buildIncomeStatement,
          'changes-in-equity': buildChangesInEquity
        };
        this.statement.set(builders[kind as keyof typeof builders](rows, t, showZero));
      });
  }

  isClickable(line: StatementLine): boolean {
    const kind = this.statement()?.kind;
    return kind === 'general-ledger' ? !!line.transactionId : !!line.accountId;
  }

  /** Opens the general ledger behind an account line, or the journal entry behind a ledger line. */
  drill(line: StatementLine): void {
    const current = this.statement();
    if (!current || !this.isClickable(line)) {
      return;
    }
    if (current.kind === 'general-ledger') {
      this.router.navigate([
        '/accounting/journal-entries/transactions/view',
        line.transactionId
      ]);
      return;
    }
    const formValue = this.form.getRawValue();
    this.previous.set({ statement: current, formValue });
    const start =
      current.kind === 'balance-sheet' ? financialYearStart(formValue.endDate, this.fyStartMonth) : formValue.startDate;
    this.form.patchValue(
      { kind: 'general-ledger', glAccountId: line.accountId, startDate: start },
      { emitEvent: false }
    );
    this.kind.set('general-ledger');
    this.run(true);
  }

  back(): void {
    const prev = this.previous();
    if (!prev) {
      return;
    }
    this.form.patchValue(prev.formValue, { emitEvent: false });
    this.kind.set(prev.formValue.kind);
    this.statement.set(prev.statement);
    const t = this.t;
    this.periodText.set(
      prev.formValue.kind === 'balance-sheet'
        ? `${t('meta.asAt')} ${this.display(prev.formValue.endDate)}`
        : `${t('meta.forPeriod')} ${this.display(prev.formValue.startDate)} ${t('meta.to')} ${this.display(prev.formValue.endDate)}`
    );
    this.previous.set(null);
  }

  private async meta(): Promise<StatementMeta> {
    const offices = this.offices();
    const headOffice = offices.find((o) => !o.parentId) || offices[0];
    const office = offices.find((o) => o.id === Number(this.form.value.officeId));
    const username = this.authenticationService.getCredentials()?.username || '';
    const t = this.t;
    return {
      entityName: SACCO.reportEntityName || headOffice?.name || '',
      officeName: office?.name || '',
      periodText: this.periodText(),
      currencyCode: this.currencyCode,
      preparedBy: username,
      generatedText: `${t('meta.generated')} ${this.dateUtils.formatDate(new Date(), 'dd MMMM yyyy HH:mm')} ${t('meta.by')} ${username}`,
      signatureLabels: [
        t('sign.preparedBy'),
        t('sign.reviewedBy'),
        t('sign.approvedBy')
      ],
      signatureFieldLabels: [
        t('sign.name'),
        t('sign.signature'),
        t('sign.date')
      ],
      logoDataUrl: await this.logo()
    };
  }

  /** Loads the report logo as a data URL. Returns undefined when there is none or it cannot be loaded. */
  private async logo(): Promise<string | undefined> {
    const url: string = SACCO.reportLogoUrl || '';
    if (!url) {
      return undefined;
    }
    try {
      const blob = await (await fetch(url)).blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  async exportPdf(): Promise<void> {
    const statement = this.statement();
    if (statement) {
      exportStatementPdf(statement, await this.meta(), this.t);
    }
  }

  async exportExcel(): Promise<void> {
    const statement = this.statement();
    if (statement) {
      await exportStatementExcel(statement, await this.meta(), this.t);
    }
  }
}
