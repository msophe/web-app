/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { ClientsService } from 'app/clients/clients.service';
import { Dates } from 'app/core/utils/dates';
import { LoansService } from 'app/loans/loans.service';
import { LoanProductService } from 'app/products/loan-products/services/loan-product.service';
import { SettingsService } from 'app/settings/settings.service';
import { CreateGuarantorComponent } from './create-guarantor.component';

describe('CreateGuarantorComponent', () => {
  const LOAN_ID = '42';

  let loansServiceStub: { createNewGuarantor: jest.Mock; guarantorAccountResource: jest.Mock };
  let clientsServiceStub: { getFilteredClients: jest.Mock; getClientAccountData: jest.Mock };

  function createComponent(): CreateGuarantorComponent {
    loansServiceStub = {
      createNewGuarantor: jest.fn(() => of({})),
      guarantorAccountResource: jest.fn(() => of({ accountLinkingOptions: [] }))
    };
    clientsServiceStub = {
      getFilteredClients: jest.fn(() => of({ pageItems: [] })),
      getClientAccountData: jest.fn(() => of({}))
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { loanId: LOAN_ID } } } },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: LoansService, useValue: loansServiceStub },
        {
          provide: LoanProductService,
          useValue: { isWorkingCapital: false, isLoanProduct: true, productType: { value: 'loans' } }
        },
        {
          provide: SettingsService,
          useValue: { language: { code: 'en' }, dateFormat: 'dd MMMM yyyy', businessDate: new Date(2026, 9, 13) }
        },
        { provide: ClientsService, useValue: clientsServiceStub },
        { provide: Dates, useValue: { formatDate: jest.fn() } },
        { provide: ChangeDetectorRef, useValue: { markForCheck: jest.fn() } }
      ]
    });

    const component = TestBed.runInInjectionContext(() => new CreateGuarantorComponent());
    component.dataObject = { allowedClientRelationshipTypes: [] };
    component.ngOnInit();
    return component;
  }

  it('does not accept a typed name until a client is picked from the list', () => {
    const component = createComponent();
    const name = component.newGuarantorForm.get('name');

    name.setValue('Ada');

    expect(name.hasError('clientNotPicked')).toBe(true);
    expect(component.newGuarantorForm.valid).toBe(false);
  });

  it('sends the picked client as entityId', () => {
    const component = createComponent();
    component.newGuarantorForm.get('name').setValue({ id: 7, displayName: 'Ada Lovelace' });

    expect(component.newGuarantorForm.valid).toBe(true);

    component.submit();

    expect(loansServiceStub.createNewGuarantor).toHaveBeenCalledWith(
      LOAN_ID,
      expect.objectContaining({ entityId: 7, guarantorTypeId: 1 })
    );
  });

  describe('SACCO guarantor savings check', () => {
    const accounts = (savings: number, loanBalance: number) => ({
      savingsAccounts: [
        {
          shortProductName: 'AKBL',
          status: { active: true },
          accountBalance: savings,
          currency: { code: 'TZS' }
        }
      ],
      loanAccounts: [{ status: { active: true }, loanBalance }]
    });

    it('shows the picked guarantor mandatory savings and active loan balance', () => {
      const component = createComponent();
      clientsServiceStub.getClientAccountData.mockReturnValue(of(accounts(500000, 1650241)));

      component.clientSelected({ id: 1, displayName: 'Tony Howard Stark' });

      expect(clientsServiceStub.getClientAccountData).toHaveBeenCalledWith('1');
      expect(component.guarantorEligibility).toEqual(
        expect.objectContaining({ currencyCode: 'TZS', mandatorySavings: 500000, totalActiveLoanBalance: 1650241 })
      );
    });

    it('ignores a late response for an earlier pick and clears when the name is retyped', () => {
      const component = createComponent();
      const first = new Subject<any>();
      const second = new Subject<any>();
      clientsServiceStub.getClientAccountData.mockImplementation((id: string): Observable<any> =>
        id === '1' ? first : second
      );

      component.clientSelected({ id: 1 });
      component.clientSelected({ id: 2 });
      second.next(accounts(300000, 0));
      first.next(accounts(999999, 0));

      expect(component.guarantorEligibility?.mandatorySavings).toBe(300000);

      component.newGuarantorForm.get('name').setValue('Ju');

      expect(component.guarantorEligibility).toBeNull();
    });
  });
});
