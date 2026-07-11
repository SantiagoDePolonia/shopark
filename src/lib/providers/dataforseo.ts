import { findSizeInTitle } from "../matching";
import { isTrustedMerchant, targetingFor } from "./geo";
import type {
  Offer,
  ProviderSearchResult,
  SearchContext,
  ShoppingIntent,
  ShoppingProvider,
} from "../types";

/**
 * Google Shopping via DataForSEO Merchant API (live/advanced).
 *
 * Like every discovery provider, results are candidates only. DataForSEO
 * returns direct merchant URLs more often than SerpAPI's Google links,
 * which makes its offers better candidates for page verification.
 */

const BASE = "https://api.dataforseo.com/v3/merchant/google/products";

/**
 * The Merchant API is task-based: create a task, then poll for the
 * result. priority 2 (high) usually completes within a few seconds.
 */
const POLL_INTERVAL_MS = 1_500;
// Keep the whole search snappy: a task that misses this window fails
// gracefully and the other providers carry the result.
const TASK_BUDGET_MS = 8_000;

function apiKey(): string | undefined {
  return process.env.DATAFORSEO_API_KEY_BASE64;
}

export function dataForSeoConfigured(): boolean {
  return Boolean(apiKey());
}

/* Response shapes, defensively typed — the API varies by item type. */

type DfsPrice = number | { current?: number; regular?: number; currency?: string } | null;

type DfsItem = {
  type?: string;
  title?: string;
  description?: string;
  seller?: string;
  price?: DfsPrice;
  product_id?: string;
  data_docid?: string;
  url?: string;
  shopping_url?: string;
  delivery_info?: {
    delivery_price?: DfsPrice;
    delivery_message?: string;
  } | null;
  product_rating?: { value?: number; votes_count?: number } | null;
  rating?: { value?: number; votes_count?: number } | null;
};

type DfsResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: DfsItem[] | null }> | null;
  }> | null;
};

function priceAmount(price: DfsPrice | undefined): number | undefined {
  if (typeof price === "number" && Number.isFinite(price)) return price;
  if (price && typeof price === "object") {
    if (typeof price.current === "number") return price.current;
    if (typeof price.regular === "number") return price.regular;
  }
  return undefined;
}

function priceCurrency(price: DfsPrice | undefined): string | undefined {
  if (price && typeof price === "object" && typeof price.currency === "string") return price.currency;
  return undefined;
}

function deliveryAmount(item: DfsItem): number | undefined {
  const info = item.delivery_info;
  if (!info) return undefined;
  const explicit = priceAmount(info.delivery_price ?? undefined);
  if (explicit !== undefined) return explicit;
  if (info.delivery_message && /free|darmow/i.test(info.delivery_message)) return 0;
  return undefined;
}

export function dfsItemToOffer(item: DfsItem, intent: ShoppingIntent, index: number): Offer | null {
  const price = priceAmount(item.price);
  if (price === undefined || !item.title) return null;
  const url = item.url || item.shopping_url;
  if (!url) return null;

  const rating = item.product_rating ?? item.rating ?? undefined;
  const titleSize = findSizeInTitle(item.title);
  const condition = /\b(used|refurbished|odnowiony|używan)/i.test(item.title) ? "used" : "new";

  return {
    id: `dfs-${item.product_id ?? item.data_docid ?? index}`,
    discoverySource: "google_shopping",
    merchant: {
      name: item.seller ?? "Unknown merchant",
      rating: rating?.value,
      reviewCount: rating?.votes_count,
      trusted: item.seller ? isTrustedMerchant(item.seller) : undefined,
    },
    product: {
      title: item.title,
      condition,
      attributes: titleSize ? { size: titleSize } : {},
    },
    pricing: {
      discoveredPrice: price,
      shipping: deliveryAmount(item),
      currency: priceCurrency(item.price) ?? intent.budget?.currency ?? "PLN",
    },
    availability: {},
    url,
    match: { score: 0, reasons: [] },
    verification: { status: "pending" },
    tags: [],
  };
}

export function parseDfsResponse(data: DfsResponse, intent: ShoppingIntent): { offers: Offer[]; error?: string } {
  if (data.status_code !== 20000) {
    return { offers: [], error: `DataForSEO: ${data.status_message ?? `status ${data.status_code}`}` };
  }
  const task = data.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) {
    return { offers: [], error: `DataForSEO task: ${task?.status_message ?? "no task returned"}` };
  }
  const items = task.result?.flatMap((r) => r.items ?? []) ?? [];
  const offers = items
    .map((item, i) => dfsItemToOffer(item, intent, i))
    .filter((o): o is Offer => o !== null);
  return { offers };
}

async function dfsFetch(key: string, url: string, body?: unknown): Promise<DfsResponse> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Basic ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`DataForSEO returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as DfsResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Task statuses that mean "still processing", not failure. */
function isTaskPending(statusCode: number | undefined): boolean {
  // 40601 Task Handed, 40602 Task In Queue, 40100/40102 result not ready
  return statusCode === 40601 || statusCode === 40602 || statusCode === 40100 || statusCode === 40102;
}

export const dataForSeoProvider: ShoppingProvider = {
  id: "google_shopping_dataforseo",
  timeoutMs: TASK_BUDGET_MS + 2_000,

  async search(intent: ShoppingIntent, _context: SearchContext): Promise<ProviderSearchResult> {
    const started = Date.now();
    const fail = (error: string): ProviderSearchResult => ({
      providerId: "google_shopping_dataforseo",
      offers: [],
      error,
      durationMs: Date.now() - started,
    });

    const key = apiKey();
    if (!key) return fail("DataForSEO key not configured");

    const locationCode = targetingFor(intent.location.country).dataForSeoLocationCode;

    // 1. Create the task at high priority.
    const posted = await dfsFetch(key, `${BASE}/task_post`, [
      {
        keyword: intent.query,
        location_code: locationCode,
        language_code: "en",
        depth: 40,
        priority: 2,
      },
    ]);
    const postedTask = posted.tasks?.[0] as { id?: string; status_code?: number; status_message?: string } | undefined;
    if (!postedTask?.id || (postedTask.status_code && postedTask.status_code >= 40000)) {
      return fail(`DataForSEO task_post: ${postedTask?.status_message ?? posted.status_message ?? "no task id"}`);
    }

    // 2. Poll until the task completes or the budget runs out.
    while (Date.now() - started < TASK_BUDGET_MS) {
      await sleep(POLL_INTERVAL_MS);
      const polled = await dfsFetch(key, `${BASE}/task_get/advanced/${postedTask.id}`);
      const task = polled.tasks?.[0];
      if (task?.status_code === 20000) {
        const { offers, error } = parseDfsResponse(polled, intent);
        return { providerId: "google_shopping_dataforseo", offers, error, durationMs: Date.now() - started };
      }
      if (task && !isTaskPending(task.status_code)) {
        return fail(`DataForSEO task: ${task.status_message ?? `status ${task.status_code}`}`);
      }
    }
    return fail("DataForSEO task did not complete in time");
  },
};
