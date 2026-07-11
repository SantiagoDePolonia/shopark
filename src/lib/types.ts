import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shopping intent                                                     */
/* ------------------------------------------------------------------ */

export const ConditionSchema = z.enum(["new", "used", "refurbished"]);

export const ShoppingIntentSchema = z.object({
  query: z.string().min(1),

  productCategory: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),

  attributes: z
    .object({
      size: z.string().optional(),
      color: z.string().optional(),
      material: z.string().optional(),
      gender: z.string().optional(),
      condition: ConditionSchema.optional(),
    })
    .catchall(z.string().optional())
    .default({}),

  budget: z
    .object({
      maximum: z.number().positive(),
      currency: z.enum(["PLN", "EUR", "USD"]),
      includesShipping: z.boolean(),
    })
    .optional(),

  location: z
    .object({
      country: z.string(),
      city: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .default({ country: "PL" }),

  preferences: z
    .object({
      excludedMerchants: z.array(z.string()).optional(),
      trustedMerchantsOnly: z.boolean().optional(),
      freeShippingPreferred: z.boolean().optional(),
    })
    .optional(),
});

export type ShoppingIntent = z.infer<typeof ShoppingIntentSchema>;

/* ------------------------------------------------------------------ */
/* Offers                                                              */
/* ------------------------------------------------------------------ */

export type DiscoverySource = "google_shopping" | "allegro" | "ebay" | "demo";

export type OfferCondition = "new" | "used" | "refurbished" | "unknown";

export type VerificationStatus =
  | "pending"
  | "verified"
  | "changed"
  | "unverifiable"
  | "unavailable"
  | "mismatched";

export type EvidenceSource =
  | "json_ld"
  | "metadata"
  | "page_text"
  | "browser"
  | "demo";

export type Offer = {
  id: string;

  discoverySource: DiscoverySource;

  merchant: {
    name: string;
    domain?: string;
    rating?: number;
    reviewCount?: number;
    trusted?: boolean;
  };

  product: {
    title: string;
    brand?: string;
    model?: string;
    gtin?: string;
    sku?: string;
    productIdentity?: string;
    category?: string;
    condition: OfferCondition;
    attributes: Record<string, string>;
  };

  pricing: {
    discoveredPrice: number;
    pagePrice?: number;
    /** undefined = shipping unknown; never assume zero */
    shipping?: number;
    duties?: number;
    discount?: number;
    totalPrice?: number;
    currency: string;
    couponRequired?: boolean;
    couponDescription?: string;
    /** advertised "old price", not evidence of a real bargain */
    oldPrice?: number;
  };

  availability: {
    available?: boolean;
    quantityRemaining?: number;
  };

  url: string;
  imageUrl?: string;

  match: {
    score: number;
    reasons: string[];
    rejectionReason?: string;
  };

  verification: {
    status: VerificationStatus;
    checkedAt?: string;
    reason?: string;
    evidenceSource?: EvidenceSource;
    discoveredPrice?: number;
    observedPrice?: number;
    observedCurrency?: string;
    observedAvailability?: boolean;
    observedShipping?: number;
  };

  tags: string[];
};

/* ------------------------------------------------------------------ */
/* Provider layer                                                      */
/* ------------------------------------------------------------------ */

export type SearchMode = "live" | "hybrid" | "demo";

export type SearchContext = {
  mode: SearchMode;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type ProviderSearchResult = {
  providerId: string;
  offers: Offer[];
  error?: string;
  durationMs: number;
};

export interface ShoppingProvider {
  id: string;
  /** Per-provider override of the default search timeout. */
  timeoutMs?: number;
  search(intent: ShoppingIntent, context: SearchContext): Promise<ProviderSearchResult>;
}

/* ------------------------------------------------------------------ */
/* Search results                                                      */
/* ------------------------------------------------------------------ */

export type SearchPhase =
  | "searching"
  | "comparing"
  | "verifying"
  | "done"
  | "error";

export type SearchResult = {
  searchId: string;
  createdAt: string;
  mode: SearchMode;
  intent: ShoppingIntent;
  phase: SearchPhase;
  progress: string[];
  winner: Offer | null;
  /** same product, other merchants */
  sameProductAlternatives: Offer[];
  /** different but similar products */
  similarAlternatives: Offer[];
  rejected: Offer[];
  providerErrors: string[];
  summary: string;
  /** set when nothing fits the budget: the closest valid match */
  closestAboveBudget?: Offer | null;
};
