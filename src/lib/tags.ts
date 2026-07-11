import { compareMoney, moneyEquals } from "./money";
import { computeTotal, knownShipping } from "./pricing";
import type { Offer } from "./types";

/**
 * Deterministic tags. Every tag requires actual evidence in the data —
 * the language model never invents tags.
 */
export function deriveTags(offer: Offer, context: { isLowestPrice: boolean; isSimilarProduct: boolean }): string[] {
  const tags: string[] = [];

  if (context.isLowestPrice) tags.push("Lowest price");

  if (offer.verification.status === "verified") tags.push("Price verified");
  if (offer.verification.status === "unverifiable") tags.push("Unverified price");
  if (offer.verification.status === "changed") {
    const { observedPrice, discoveredPrice } = offer.verification;
    if (
      observedPrice !== undefined &&
      discoveredPrice !== undefined &&
      compareMoney(observedPrice, discoveredPrice) < 0
    ) {
      tags.push("Price dropped");
    } else {
      tags.push("Price changed");
    }
  }

  const shipping = knownShipping(offer);
  if (shipping !== undefined && moneyEquals(shipping, 0)) tags.push("Free delivery");
  if (shipping === undefined) tags.push("Shipping unknown");

  const qty = offer.availability.quantityRemaining;
  if (qty !== undefined && qty > 0 && qty <= 3) tags.push("Limited stock");

  if (offer.merchant.trusted) tags.push("Trusted merchant");
  if ((offer.merchant.rating ?? 0) >= 4.7 && (offer.merchant.reviewCount ?? 0) >= 100)
    tags.push("Best rated");

  if (offer.product.condition === "new") tags.push("New");
  if (offer.product.condition === "used") tags.push("Used");

  if (offer.pricing.couponRequired) tags.push("Coupon required");
  if (context.isSimilarProduct) tags.push("Similar product");

  return tags;
}

/** Attach tags across a ranked list; the first entry is the price leader. */
export function tagRankedOffers(ranked: Offer[], similarIds: Set<string>): Offer[] {
  const totals = ranked
    .map((o) => computeTotal(o))
    .filter((t): t is number => t !== undefined);
  const lowestTotal = totals.length ? Math.min(...totals) : undefined;

  return ranked.map((offer) => {
    const total = computeTotal(offer);
    const isLowestPrice =
      lowestTotal !== undefined && total !== undefined && moneyEquals(total, lowestTotal);
    return {
      ...offer,
      tags: deriveTags(offer, { isLowestPrice, isSimilarProduct: similarIds.has(offer.id) }),
    };
  });
}
