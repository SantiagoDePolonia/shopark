import { parsePrice } from "../money";
import type { EvidenceSource } from "../types";

/**
 * Extract product evidence from a merchant page, structured data first:
 * schema.org JSON-LD → Open Graph / metadata → visible page text.
 */

export type PageEvidence = {
  source: EvidenceSource;
  title?: string;
  price?: number;
  currency?: string;
  availability?: boolean;
  gtin?: string;
  sku?: string;
  shipping?: number;
};

type JsonLdNode = Record<string, unknown>;

function* iterateJsonLdNodes(node: unknown): Generator<JsonLdNode> {
  if (Array.isArray(node)) {
    for (const item of node) yield* iterateJsonLdNodes(item);
  } else if (node && typeof node === "object") {
    const obj = node as JsonLdNode;
    yield obj;
    if (obj["@graph"]) yield* iterateJsonLdNodes(obj["@graph"]);
  }
}

function nodeType(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parsePrice(value)?.amount;
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseAvailability(value: unknown): boolean | undefined {
  const s = asString(value)?.toLowerCase();
  if (!s) return undefined;
  if (s.includes("instock") || s.includes("in_stock") || s.includes("limitedavailability")) return true;
  if (s.includes("outofstock") || s.includes("soldout") || s.includes("discontinued")) return false;
  return undefined;
}

function extractOfferNode(offer: JsonLdNode, evidence: PageEvidence): void {
  evidence.price ??= asNumber(offer.price) ?? asNumber(offer.lowPrice);
  evidence.currency ??= asString(offer.priceCurrency);
  evidence.availability ??= parseAvailability(offer.availability);
  const spec = offer.priceSpecification;
  if (spec && typeof spec === "object") {
    evidence.price ??= asNumber((spec as JsonLdNode).price);
    evidence.currency ??= asString((spec as JsonLdNode).priceCurrency);
  }
  const shipping = offer.shippingDetails;
  if (shipping && typeof shipping === "object") {
    const rate = (shipping as JsonLdNode).shippingRate;
    if (rate && typeof rate === "object") {
      evidence.shipping ??= asNumber((rate as JsonLdNode).value);
    }
  }
}

export function extractJsonLd(html: string): PageEvidence | null {
  const scripts = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    for (const node of iterateJsonLdNodes(parsed)) {
      const types = nodeType(node);
      if (!types.includes("Product")) continue;

      const evidence: PageEvidence = { source: "json_ld" };
      evidence.title = asString(node.name);
      evidence.gtin =
        asString(node.gtin13) ?? asString(node.gtin) ?? asString(node.gtin12) ?? asString(node.gtin14);
      evidence.sku = asString(node.sku);

      const offers = node.offers;
      for (const offerNode of iterateJsonLdNodes(offers)) {
        const offerTypes = nodeType(offerNode);
        if (offerTypes.includes("Offer") || offerTypes.includes("AggregateOffer") || offerNode.price !== undefined) {
          extractOfferNode(offerNode, evidence);
        }
      }

      if (evidence.price !== undefined || evidence.availability !== undefined) return evidence;
    }
  }
  return null;
}

export function extractMetadata(html: string): PageEvidence | null {
  const meta = (property: string): string | undefined => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']|<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name|itemprop)\\s*=\\s*["']${property}["']`,
      "i",
    );
    const m = html.match(re);
    return m ? (m[1] ?? m[2]) : undefined;
  };

  const priceRaw =
    meta("product:price:amount") ?? meta("og:price:amount") ?? meta("price");
  const price = priceRaw ? parsePrice(priceRaw)?.amount : undefined;
  if (price === undefined) return null;

  return {
    source: "metadata",
    title: meta("og:title"),
    price,
    currency: meta("product:price:currency") ?? meta("og:price:currency") ?? meta("priceCurrency"),
    availability: parseAvailability(meta("product:availability") ?? meta("og:availability") ?? meta("availability")),
  };
}

export function extractPageText(html: string): PageEvidence | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Look for a plausible price near a currency marker.
  const m = text.match(/(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})?)\s*(zł|PLN|EUR|€|USD|\$)/i);
  if (!m) return null;
  const parsed = parsePrice(`${m[1]} ${m[2]}`);
  if (!parsed) return null;

  const soldOut = /\b(sold out|out of stock|niedostępny|wyprzedane|brak w magazynie)\b/i.test(text);

  return {
    source: "page_text",
    price: parsed.amount,
    currency: parsed.currency,
    availability: soldOut ? false : undefined,
  };
}

export function extractEvidence(html: string): PageEvidence | null {
  return extractJsonLd(html) ?? extractMetadata(html) ?? extractPageText(html);
}
