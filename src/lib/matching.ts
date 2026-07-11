import type { Offer, ShoppingIntent } from "./types";

/**
 * Same-product matching.
 *
 * Deterministic code enforces critical constraints (size, condition,
 * color, capacity…). Semantic similarity only nudges the score and can
 * never override a conflicting critical attribute.
 */

export type MatchResult = {
  score: number;
  reasons: string[];
  rejectionReason?: string;
};

const SIZE_KEYS = ["size", "shoeSize", "clothingSize"];
const CAPACITY_KEYS = ["capacity", "storage", "storageCapacity"];

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    // NFD strips combining diacritics, but Polish ł/Ł has no decomposition.
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeSize(value: string): string {
  // "EU 43", "43 EU", "43.0", "43,0" → "43"
  const m = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!m) return normalizeToken(value);
  const n = Number.parseFloat(m[1]);
  return Number.isInteger(n) ? String(n) : String(n);
}

export function normalizeCapacity(value: string): string {
  // "1TB", "1 TB", "1000 GB" → gigabytes as string
  const m = value.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(tb|gb|mb)/);
  if (!m) return normalizeToken(value);
  const n = Number.parseFloat(m[1]);
  const unit = m[2];
  const gb = unit === "tb" ? n * 1000 : unit === "mb" ? n / 1000 : n;
  return `${gb}`;
}

function offerAttr(offer: Offer, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = offer.product.attributes[key];
    if (v) return v;
  }
  return undefined;
}

function intentAttr(intent: ShoppingIntent, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = intent.attributes[key];
    if (v) return v;
  }
  return undefined;
}

function titleContainsColor(offer: Offer, color: string): boolean {
  return normalizeToken(offer.product.title).includes(normalizeToken(color));
}

/** Find a shoe/clothing size embedded in a listing title. */
export function findSizeInTitle(title: string): string | undefined {
  const patterns = [
    /(?:size|rozmiar|roz\.?|eu)\s*:?\s*(\d{2}(?:[.,]5)?)\b/i,
    /[\/|]\s*(\d{2}(?:[.,]5)?)\s*[\/|]/,
    /\b(\d{2}(?:[.,]5)?)\s*eu\b/i,
  ];
  for (const pattern of patterns) {
    const m = title.match(pattern);
    if (m) return m[1].replace(",", ".");
  }
  return undefined;
}

/**
 * Strip constraint phrasing (budget, size, delivery, filler) so title
 * similarity compares product words, not the request's grammar.
 */
export function cleanQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\b(find me|find|please|looking for|i want|i need)\b/g, " ")
    .replace(/\b(under|below|up to|max|maximum|less than|no more than|for)\s*\d+[\d.,]*\s*(pln|zł|eur|€|usd|\$)?/g, " ")
    .replace(/\b\d+[\d.,]*\s*(pln|zł|eur|€|usd|\$)\b/g, " ")
    .replace(/\b(size|rozmiar)\s*\d+(?:[.,]5)?\b/g, " ")
    .replace(/\b(including|incl|with)?\s*(delivery|shipping|delivered)\b/g, " ")
    .replace(/\b(a|an|the|for|in|me|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap lexical similarity between the request and an offer title. */
export function titleSimilarity(query: string, title: string): number {
  const queryTokens = new Set(normalizeToken(query).split(" ").filter(Boolean));
  const titleTokens = new Set(normalizeToken(title).split(" ").filter(Boolean));
  if (queryTokens.size === 0) return 0;
  let hits = 0;
  for (const t of queryTokens) if (titleTokens.has(t)) hits++;
  return hits / queryTokens.size;
}

/**
 * Detect a model-generation conflict: the query names "<word> <number>"
 * ("iphone 16", "playstation 5") but the title pairs the same word with
 * a different number ("iphone 14"). Deterministic, language-agnostic.
 */
export function modelNumberConflict(queries: string[], title: string): string | null {
  const titleNorm = normalizeToken(title);
  for (const q of queries) {
    for (const m of normalizeToken(q).matchAll(/([a-z]{3,})\s+(\d{1,3})\b/g)) {
      const word = m[1];
      const num = m[2];
      const inTitle = titleNorm.match(new RegExp(`\\b${word}\\s+(\\d{1,3})\\b`));
      if (inTitle && inTitle[1] !== num) return `${word} ${inTitle[1]}`;
    }
  }
  return null;
}

export function matchOffer(intent: ShoppingIntent, offer: Offer): MatchResult {
  const reasons: string[] = [];
  let satisfiedCritical = 0;

  const queryVariants = [intent.query, intent.searchQuery, intent.localizedQuery].filter(
    (v): v is string => Boolean(v),
  );

  const conflictingModel = modelNumberConflict(queryVariants, offer.product.title);
  if (conflictingModel) {
    return {
      score: 0,
      reasons: [],
      rejectionReason: `The offer is for ${conflictingModel}, a different model generation`,
    };
  }

  /* ---- critical attributes: hard rejections first ---- */

  const wantedCondition = intent.attributes.condition;
  if (wantedCondition && offer.product.condition !== "unknown") {
    if (offer.product.condition !== wantedCondition) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Condition is ${offer.product.condition}, requested ${wantedCondition}`,
      };
    }
    reasons.push(`Condition is ${wantedCondition}`);
    satisfiedCritical++;
  }

  let sizeUnconfirmed = false;
  const wantedSize = intentAttr(intent, SIZE_KEYS);
  if (wantedSize) {
    const offerSize = offerAttr(offer, SIZE_KEYS) ?? findSizeInTitle(offer.product.title);
    if (offerSize && normalizeSize(offerSize) !== normalizeSize(wantedSize)) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Size ${offerSize} does not match requested size ${wantedSize}`,
      };
    }
    if (offerSize) {
      reasons.push(`Size ${wantedSize} is available`);
      satisfiedCritical++;
    } else {
      // A critical size must match explicitly; with no size evidence the
      // offer cannot compete for the win.
      sizeUnconfirmed = true;
    }
  }

  const wantedCapacity = intentAttr(intent, CAPACITY_KEYS);
  if (wantedCapacity) {
    const offerCapacity = offerAttr(offer, CAPACITY_KEYS);
    if (offerCapacity && normalizeCapacity(offerCapacity) !== normalizeCapacity(wantedCapacity)) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Capacity ${offerCapacity} does not match requested ${wantedCapacity}`,
      };
    }
    if (offerCapacity) {
      reasons.push(`Capacity ${wantedCapacity} matches`);
      satisfiedCritical++;
    }
  }

  const wantedColor = intent.attributes.color;
  if (wantedColor) {
    const offerColor = offer.product.attributes.color;
    const colorMatches = offerColor
      ? normalizeToken(offerColor).includes(normalizeToken(wantedColor)) ||
        normalizeToken(wantedColor).includes(normalizeToken(offerColor))
      : titleContainsColor(offer, wantedColor);
    if (offerColor && !colorMatches) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Color is ${offerColor}, requested ${wantedColor}`,
      };
    }
    if (colorMatches) {
      reasons.push(`Requested color matches`);
      satisfiedCritical++;
    }
  }

  const wantedGender = intent.attributes.gender;
  if (wantedGender) {
    const offerGender = offer.product.attributes.gender;
    if (offerGender && normalizeToken(offerGender) !== normalizeToken(wantedGender)) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Intended for ${offerGender}, requested ${wantedGender}`,
      };
    }
  }

  /* ---- positive evidence, strongest first ---- */

  let score = 0;

  if (intent.brand && offer.product.brand) {
    if (normalizeToken(intent.brand) === normalizeToken(offer.product.brand)) {
      score += 0.3;
      if (
        intent.model &&
        offer.product.model &&
        normalizeToken(offer.product.model).includes(normalizeToken(intent.model))
      ) {
        score += 0.25;
        reasons.push("Exact brand and model match");
      } else {
        reasons.push("Brand matches");
      }
    } else {
      // Different brand: still allowed as a *similar* product, low score.
      score -= 0.2;
    }
  }

  // Compare the title against every query variant we have (original,
  // normalized, Polish) and keep the best score — listings in the local
  // market language must not be penalized.
  const variants = queryVariants.map((v) => cleanQuery(v) || v);
  const similarity = Math.max(...variants.map((v) => titleSimilarity(v, offer.product.title)));
  score += similarity * 0.4;
  score += Math.min(satisfiedCritical, 4) * 0.12;
  if (sizeUnconfirmed) score -= 0.3;
  if (similarity >= 0.6) reasons.push("Title closely matches the request");

  if (intent.productCategory) {
    const categoryMatches =
      offer.product.category &&
      normalizeToken(offer.product.category).includes(normalizeToken(intent.productCategory));
    if (categoryMatches) {
      score += 0.15;
      reasons.push("Category matches");
    } else {
      // Off-category penalty — but only when the user actually said the
      // category. An LLM-inferred label ("accessories") naturally never
      // appears in titles and must not sink every offer.
      const userStatedCategory = normalizeToken(intent.query).includes(
        normalizeToken(intent.productCategory),
      );
      const categoryTokens = normalizeToken(intent.productCategory)
        .split(" ")
        .filter((t) => t.length > 2);
      const titleNorm = normalizeToken(offer.product.title);
      const inTitle =
        categoryTokens.length > 0 && categoryTokens.every((t) => titleNorm.includes(t));
      if (userStatedCategory && !inTitle && !offer.product.category) score -= 0.15;
    }
  }

  score = Math.max(0, Math.min(1, score));
  return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * Group key for "same product" detection across merchants.
 * Evidence order: GTIN → SKU → brand+model → normalized title.
 */
export function productIdentity(offer: Offer): string {
  if (offer.product.gtin) return `gtin:${offer.product.gtin}`;
  if (offer.product.sku && offer.product.brand)
    return `sku:${normalizeToken(offer.product.brand)}:${offer.product.sku.toLowerCase()}`;
  if (offer.product.brand && offer.product.model)
    return `bm:${normalizeToken(offer.product.brand)}:${normalizeToken(offer.product.model)}`;
  return `title:${normalizeToken(offer.product.title)}`;
}

/** Offers below this score are treated as non-matching noise. */
export const MATCH_THRESHOLD = 0.35;
