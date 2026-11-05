/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from 'environments/environment';

/** Redirects to the landing page when the given SACCO-mode flag hides a section. */
const blockWhen =
  (flag: 'hideMicrofinanceCenters' | 'hideCollectionSheets'): CanActivateFn =>
  () => {
    const sacco = environment.saccoMode;
    return sacco?.enabled && sacco[flag] ? inject(Router).createUrlTree(['/']) : true;
  };

export const hideCentersGuard = blockWhen('hideMicrofinanceCenters');
export const hideCollectionSheetsGuard = blockWhen('hideCollectionSheets');
