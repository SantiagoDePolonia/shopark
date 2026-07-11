import { parsePrice } from "../money";
import { isTrustedMerchant, safeOfferUrl, targetingFor } from "./geo";
import type {
  Offer,
  ProviderSearchResult,
  SearchContext,
  ShoppingIntent,
  ShoppingProvider,
} from "../types";

/**
 * Google Shopping via SerpAPI.
 *
 * Discovery only: results are candidates, never the source of truth.
 * Google Shopping links usually point at Google itself, so most live
 * offers stay "unverifiable" unless a direct merchant URL is present.
 */

type SerpShoppingResult = {
  position?: number;
  title?: string;
  product_id?: string;
  product_link?: string;
  link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  old_price?: string;
  extracted_old_price?: number;
  rating?: number;
  reviews?: number;
  delivery?: string;
  thumbnail?: string;
  second_hand_condition?: string;
  tag?: string;
};

function apiKey(): string | undefined {
  return process.env.SERPAPI_API_KEY || process.env.SERF_API;
}

export function serpApiConfigured(): boolean {
  return Boolean(apiKey());
}

function buildQuery(intent: ShoppingIntent): string {
  // Prefer the Polish query for the Polish market, then the normalized
  // one; Google matches Polish listings far better in Polish.
  const base = intent.localizedQuery ?? intent.searchQuery ?? intent.query;
  const parts = [base];
  const size = intent.attributes.size;
  if (size && !base.toLowerCase().includes(size.toLowerCase())) parts.push(`rozmiar ${size}`);
  return parts.join(" ");
}

function parseDelivery(delivery: string | undefined): number | undefined {
  if (!delivery) return undefined;
  if (/free/i.test(delivery) || /darmow/i.test(delivery)) return 0;
  const parsed = parsePrice(delivery);
  return parsed?.amount;
}

function extractSizeFromTitle(title: string): string | undefined {
  const m = title.match(/\b(?:size|rozmiar|eu)\s*(\d{2}(?:[.,]5)?)\b/i);
  return m ? m[1].replace(",", ".") : undefined;
}

function toOffer(result: SerpShoppingResult, intent: ShoppingIntent, index: number): Offer | null {
  const price = result.extracted_price ?? parsePrice(result.price ?? "")?.amount;
  if (price === undefined || !result.title) return null;

  const rawUrl = result.link || result.product_link;
  if (!rawUrl) return null;
  const url = safeOfferUrl(rawUrl, result.title, result.source, result.product_id);

  const condition = result.second_hand_condition ? "used" : "new";
  const titleSize = extractSizeFromTitle(result.title);

  return {
    id: `gs-${result.product_id ?? index}`,
    discoverySource: "google_shopping",
    merchant: {
      name: result.source ?? "Unknown merchant",
      rating: result.rating,
      reviewCount: result.reviews,
      trusted: result.source ? isTrustedMerchant(result.source) : undefined,
    },
    product: {
      title: result.title,
      condition,
      attributes: titleSize ? { size: titleSize } : {},
    },
    pricing: {
      discoveredPrice: price,
      shipping: parseDelivery(result.delivery),
      oldPrice: result.extracted_old_price ?? parsePrice(result.old_price ?? "")?.amount,
      currency: intent.budget?.currency ?? "PLN",
    },
    availability: {},
    url,
    imageUrl: result.thumbnail,
    match: { score: 0, reasons: [] },
    verification: { status: "pending" },
    tags: [],
  };
}

export const serpApiProvider: ShoppingProvider = {
  id: "google_shopping",

  async search(intent: ShoppingIntent, context: SearchContext): Promise<ProviderSearchResult> {
    const started = Date.now();
    const key = apiKey();
    if (!key) {
      return {
        providerId: "google_shopping",
        offers: [],
        error: "SerpAPI key not configured",
        durationMs: 0,
      };
    }

    const targeting = targetingFor(intent.location.country);
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: buildQuery(intent),
      gl: targeting.gl,
      google_domain: targeting.googleDomain,
      hl: "en",
      num: "40",
      api_key: key,
    });
    if (targeting.location) params.set("location", targeting.location);

    const response = await fetch(`https://serpapi.com/search?${params}`, {
      signal: context.signal ?? AbortSignal.timeout(context.timeoutMs),
    });
    if (!response.ok) {
      return {
        providerId: "google_shopping",
        offers: [],
        error: `SerpAPI returned ${response.status}`,
        durationMs: Date.now() - started,
      };
    }

    const data = (await response.json()) as { shopping_results?: SerpShoppingResult[] };
    const offers = (data.shopping_results ?? [])
      .map((r, i) => toOffer(r, intent, i))
      .filter((o): o is Offer => o !== null);

    return { providerId: "google_shopping", offers, durationMs: Date.now() - started };
  },
};
