/**
 * Copyright since 2025 Mifos Initiative
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** A button on the login hero panel. `labelKey` is a translation key. */
export interface BrandingLink {
  labelKey: string;
  url: string;
}

/** Platform branding shown on the login page, sidenav, home page and browser tab. */
export interface Branding {
  /** Full platform name: login heading, browser tab title. */
  appName: string;
  /** Short name next to the sidenav logo. */
  shortName: string;
  /** Login logo (light theme). */
  logoUrl: string;
  /** Login logo (dark theme). */
  logoDarkUrl: string;
  /** Square logo in the sidenav header. */
  logoSmallUrl: string;
  /** Login hero panel background photo. */
  loginBackgroundUrl: string;
  /** Image in the home welcome card; null hides it. */
  homeImageUrl: string | null;
  /** Login hero panel buttons; empty renders none. */
  featureLinks: BrandingLink[];
}

/** Bundled logo, also the fallback when a configured logo fails to load. */
export const DEFAULT_BRAND_LOGO = 'assets/images/branding/agakhansaccos-logo.jpg';

/** Value meaning "no image" for MIFOS_BRAND_HOME_IMAGE_URL (an unset variable is substituted as ''). */
const NO_IMAGE = 'none';

const pick = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

/**
 * Builds the branding from the runtime `window.env` values (see `src/assets/env.template.js`),
 * falling back to the defaults bundled with this build.
 */
export function buildBranding(loadedEnv: Record<string, any>): Branding {
  const logoUrl = pick(loadedEnv['tenantLogoUrl'], DEFAULT_BRAND_LOGO);
  const homeImage = pick(loadedEnv['brandHomeImageUrl'], DEFAULT_BRAND_LOGO);
  return {
    appName: pick(loadedEnv['brandAppName'], 'SACCO Core Banking'),
    shortName: pick(loadedEnv['brandShortName'], 'SACCO Core'),
    logoUrl,
    logoDarkUrl: pick(loadedEnv['tenantLogoUrlDark'], logoUrl),
    logoSmallUrl: pick(loadedEnv['brandLogoSmallUrl'], DEFAULT_BRAND_LOGO),
    loginBackgroundUrl: pick(loadedEnv['brandLoginBackgroundUrl'], 'assets/images/branding/home.png'),
    homeImageUrl: homeImage.toLowerCase() === NO_IMAGE ? null : homeImage,
    featureLinks: []
  };
}
