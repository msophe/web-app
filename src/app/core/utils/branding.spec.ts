/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_BRAND_LOGO, buildBranding } from 'environments/branding';

describe('buildBranding', () => {
  it('should use the bundled defaults when nothing is configured', () => {
    // envsubst writes '' for unset variables
    const branding = buildBranding({ tenantLogoUrl: '', brandAppName: '', brandHomeImageUrl: '' });

    expect(branding.appName).toBe('SACCO Core Banking');
    expect(branding.shortName).toBe('SACCO Core');
    expect(branding.logoUrl).toBe(DEFAULT_BRAND_LOGO);
    expect(branding.logoDarkUrl).toBe(DEFAULT_BRAND_LOGO);
    expect(branding.logoSmallUrl).toBe(DEFAULT_BRAND_LOGO);
    expect(branding.loginBackgroundUrl).toBe('assets/images/branding/home.png');
    expect(branding.homeImageUrl).toBe(DEFAULT_BRAND_LOGO);
    expect(branding.featureLinks).toEqual([]);
  });

  it('should apply runtime overrides, with the dark logo following the light one', () => {
    const branding = buildBranding({
      brandAppName: ' DCB CORE ',
      brandShortName: 'DCB',
      tenantLogoUrl: 'https://cdn.example.com/logo.png',
      brandLoginBackgroundUrl: 'assets/images/branding/other.jpg'
    });

    expect(branding.appName).toBe('DCB CORE');
    expect(branding.shortName).toBe('DCB');
    expect(branding.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(branding.logoDarkUrl).toBe('https://cdn.example.com/logo.png');
    expect(branding.loginBackgroundUrl).toBe('assets/images/branding/other.jpg');
  });

  it('should hide the home image when set to none', () => {
    expect(buildBranding({ brandHomeImageUrl: 'None' }).homeImageUrl).toBeNull();
  });
});
