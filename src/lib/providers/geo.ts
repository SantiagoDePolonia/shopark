/**
 * Country-specific search targeting and merchant reputation.
 * Poland is the primary market; other countries fall back to defaults.
 */

export type CountryTargeting = {
  gl: string;
  googleDomain: string;
  /** SerpAPI "location" free-text parameter */
  location?: string;
  dataForSeoLocationCode: number;
};

const TARGETING: Record<string, CountryTargeting> = {
  PL: {
    gl: "pl",
    googleDomain: "google.pl",
    location: "Warsaw,Poland",
    dataForSeoLocationCode: 2616,
  },
  DE: { gl: "de", googleDomain: "google.de", dataForSeoLocationCode: 2276 },
  US: { gl: "us", googleDomain: "google.com", dataForSeoLocationCode: 2840 },
  GB: { gl: "uk", googleDomain: "google.co.uk", dataForSeoLocationCode: 2826 },
};

export function targetingFor(country: string): CountryTargeting {
  return TARGETING[country.toUpperCase()] ?? TARGETING.PL;
}

/**
 * Established Polish merchants. Powers the "Trusted merchant" tag and
 * the trusted tie-breaker in ranking — never overrides price.
 */
const TRUSTED_MERCHANTS_PL = [
  "x-kom", "mediaexpert", "media expert", "euro.com", "rtv euro agd",
  "mediamarkt", "media markt", "empik", "eobuwie", "morele",
  "komputronik", "neonet", "allegro", "zalando", "answear",
  "sportowysklep", "decathlon", "intersport", "smyk", "doz",
];

export function isTrustedMerchant(name: string, domain?: string): boolean {
  const haystack = `${name} ${domain ?? ""}`.toLowerCase();
  return TRUSTED_MERCHANTS_PL.some((m) => haystack.includes(m));
}
