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

/** Cheap lexical similarity between the request and an offer title. */
export function titleSimilarity(query: string, title: string): number {
  const queryTokens = new Set(normalizeToken(query).split(" ").filter(Boolean));
  const titleTokens = new Set(normalizeToken(title).split(" ").filter(Boolean));
  if (queryTokens.size === 0) return 0;
  let hits = 0;
  for (const t of queryTokens) if (titleTokens.has(t)) hits++;
  return hits / queryTokens.size;
}

export function matchOffer(intent: ShoppingIntent, offer: Offer): MatchResult {
  const reasons: string[] = [];

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
  }

  const wantedSize = intentAttr(intent, SIZE_KEYS);
  if (wantedSize) {
    const offerSize = offerAttr(offer, SIZE_KEYS);
    if (offerSize && normalizeSize(offerSize) !== normalizeSize(wantedSize)) {
      return {
        score: 0,
        reasons: [],
        rejectionReason: `Size ${offerSize} does not match requested size ${wantedSize}`,
      };
    }
    if (offerSize) reasons.push(`Size ${wantedSize} is available`);
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
    if (offerCapacity) reasons.push(`Capacity ${wantedCapacity} matches`);
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
    if (colorMatches) reasons.push(`Requested color matches`);
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

  const similarity = titleSimilarity(intent.query, offer.product.title);
  score += similarity * 0.45;
  if (similarity >= 0.6) reasons.push("Title closely matches the request");

  if (
    intent.productCategory &&
    offer.product.category &&
    normalizeToken(offer.product.category).includes(normalizeToken(intent.productCategory))
  ) {
    score += 0.15;
    reasons.push("Category matches");
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
