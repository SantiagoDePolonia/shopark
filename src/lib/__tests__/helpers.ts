import type { Offer, ShoppingIntent } from "../types";

export function makeIntent(overrides: Partial<ShoppingIntent> = {}): ShoppingIntent {
  return {
    query: "new white basketball shoes size 43 under 300 PLN delivered",
    productCategory: "basketball shoes",
    brand: undefined,
    attributes: { size: "43", color: "white", condition: "new" },
    budget: { maximum: 300, currency: "PLN", includesShipping: true },
    location: { country: "PL" },
    ...overrides,
  };
}

let counter = 0;

export function makeOffer(overrides: {
  id?: string;
  title?: string;
  brand?: string;
  model?: string;
  gtin?: string;
  condition?: Offer["product"]["condition"];
  attributes?: Record<string, string>;
  price: number;
  pagePrice?: number;
  shipping?: number;
  discount?: number;
  currency?: string;
  available?: boolean;
  quantityRemaining?: number;
  verificationStatus?: Offer["verification"]["status"];
  observedPrice?: number;
  observedShipping?: number;
  matchScore?: number;
  rejectionReason?: string;
  merchantRating?: number;
  merchantReviews?: number;
  trusted?: boolean;
  couponRequired?: boolean;
}): Offer {
  counter++;
  return {
    id: overrides.id ?? `test-${counter}`,
    discoverySource: "demo",
    merchant: {
      name: `Merchant ${counter}`,
      rating: overrides.merchantRating,
      reviewCount: overrides.merchantReviews,
      trusted: overrides.trusted,
    },
    product: {
      title: overrides.title ?? "Nike Court Vision Low White",
      brand: overrides.brand ?? "Nike",
      model: overrides.model ?? "Court Vision Low",
      gtin: overrides.gtin,
      category: "basketball shoes",
      condition: overrides.condition ?? "new",
      attributes: overrides.attributes ?? { size: "43", color: "white" },
    },
    pricing: {
      discoveredPrice: overrides.price,
      pagePrice: overrides.pagePrice,
      shipping: overrides.shipping,
      discount: overrides.discount,
      currency: overrides.currency ?? "PLN",
      couponRequired: overrides.couponRequired,
    },
    availability: {
      available: overrides.available,
      quantityRemaining: overrides.quantityRemaining,
    },
    url: `https://example.com/offer/${counter}`,
    match: {
      score: overrides.matchScore ?? 0.9,
      reasons: [],
      rejectionReason: overrides.rejectionReason,
    },
    verification: {
      status: overrides.verificationStatus ?? "pending",
      observedPrice: overrides.observedPrice,
      observedShipping: overrides.observedShipping,
    },
    tags: [],
  };
}
