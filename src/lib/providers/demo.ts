import type {
  Offer,
  ProviderSearchResult,
  ShoppingIntent,
  ShoppingProvider,
} from "../types";
import {
  BASKETBALL_SHOE_OFFERS,
  HEADPHONE_OFFERS,
  SSD_OFFERS,
  type DemoOffer,
  type DemoVerificationFixture,
} from "./demo-data";

/**
 * Deterministic local provider. Always returns predictable, realistic
 * offers so the demo works with zero credentials and zero network.
 */

const fixtureIndex = new Map<string, DemoVerificationFixture>();

function toOffer(demo: DemoOffer): Offer {
  fixtureIndex.set(demo.id, demo.fixture);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fixture: _fixture, ...rest } = demo;
  return {
    ...rest,
    match: { score: 0, reasons: [] },
    verification: { status: "pending" },
    tags: [],
  };
}

export function demoFixtureFor(offerId: string): DemoVerificationFixture | undefined {
  return fixtureIndex.get(offerId);
}

/** True for fabricated filler offers (vs the curated demo scenarios). */
export function isGenericDemoOffer(offer: Offer): boolean {
  return offer.id.startsWith("demo-generic-");
}

const SCENARIOS: { keywords: string[]; offers: DemoOffer[] }[] = [
  {
    keywords: ["basketball", "shoe", "shoes", "sneaker", "sneakers", "nike", "trainers"],
    offers: BASKETBALL_SHOE_OFFERS,
  },
  {
    keywords: ["headphone", "headphones", "earbuds", "noise", "cancelling", "sony", "audio"],
    offers: HEADPHONE_OFFERS,
  },
  {
    keywords: ["ssd", "drive", "storage", "usb-c", "portable", "disk", "samsung"],
    offers: SSD_OFFERS,
  },
];

/** Mulberry32: deterministic RNG seeded from the query text. */
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const GENERIC_MERCHANTS = [
  { name: "Allegro seller TopDeal", domain: "allegro.pl", rating: 4.6, reviewCount: 5400 },
  { name: "MegaStore.pl", domain: "megastore.pl", rating: 4.3, reviewCount: 890 },
  { name: "OutletOnline.pl", domain: "outletonline.pl", rating: 4.1, reviewCount: 260 },
  { name: "DobreCeny.pl", domain: "dobreceny.pl", rating: 4.4, reviewCount: 1300 },
  { name: "SklepXL.pl", domain: "sklepxl.pl", rating: 3.9, reviewCount: 75 },
  { name: "PrimeShop.pl", domain: "primeshop.pl", rating: 4.7, reviewCount: 9800, trusted: true },
];

/**
 * Fallback for arbitrary queries: fabricate a stable, plausible offer set
 * around the stated budget so demo mode never comes back empty.
 */
function genericOffers(intent: ShoppingIntent): Offer[] {
  const rand = seededRandom(intent.query.toLowerCase().trim());
  const base = intent.budget ? intent.budget.maximum * (0.75 + rand() * 0.15) : 120 + rand() * 400;
  const currency = intent.budget?.currency ?? "PLN";
  const titleBase = intent.query
    .replace(/\b(find|me|a|an|the|under|below|for|up to|new)\b/gi, " ")
    .replace(/\d+\s*(pln|eur|usd|zł)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fixtures: DemoVerificationFixture[] = [
    { outcome: "verified" },
    { outcome: "verified" },
    { outcome: "verified" },
    { outcome: "changed", observedPrice: round2(base * 1.12) },
    { outcome: "unverifiable", reason: "The merchant blocked automated verification" },
    { outcome: "verified" },
  ];

  return GENERIC_MERCHANTS.map((merchant, i) => {
    const price = round2(base * (0.95 + rand() * 0.3));
    const shipping = i === 4 ? undefined : rand() > 0.5 ? 0 : round2(8 + rand() * 12);
    const id = `demo-generic-${i}`;
    const demo: DemoOffer = {
      id,
      discoverySource: "demo",
      merchant,
      product: {
        title: capitalize(titleBase) || intent.query,
        brand: intent.brand,
        model: intent.model,
        category: intent.productCategory,
        condition: intent.attributes.condition ?? "new",
        attributes: Object.fromEntries(
          Object.entries(intent.attributes).filter(([, v]) => v !== undefined),
        ) as Record<string, string>,
      },
      pricing: { discoveredPrice: price, shipping, currency },
      availability: {},
      url: `https://demo-merchants.shopark.local/offer/generic-${i}`,
      imageUrl: `/demo-products/generic-${(i % 3) + 1}.svg`,
      fixture: fixtures[i],
    };
    return toOffer(demo);
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export const demoProvider: ShoppingProvider = {
  id: "demo",

  async search(intent: ShoppingIntent): Promise<ProviderSearchResult> {
    const started = Date.now();
    const haystack = [
      intent.query,
      intent.productCategory ?? "",
      intent.brand ?? "",
      Object.values(intent.attributes).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    let best: { offers: DemoOffer[]; hits: number } | null = null;
    for (const scenario of SCENARIOS) {
      const hits = scenario.keywords.filter((k) => haystack.includes(k)).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { offers: scenario.offers, hits };
    }

    const offers = best ? best.offers.map(toOffer) : genericOffers(intent);
    return { providerId: "demo", offers, durationMs: Date.now() - started };
  },
};
