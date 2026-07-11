import { addMoney, subtractMoney } from "./money";
import type { Offer } from "./types";

/**
 * total = current product price + delivery + known duties − valid discounts
 *
 * Missing shipping is NEVER treated as zero: totalPrice stays undefined
 * and the offer is ranked with lower confidence.
 */

/** The price we currently believe, preferring the merchant page over discovery. */
export function currentPrice(offer: Offer): number {
  if (offer.verification.observedPrice !== undefined) return offer.verification.observedPrice;
  if (offer.pricing.pagePrice !== undefined) return offer.pricing.pagePrice;
  return offer.pricing.discoveredPrice;
}

export function knownShipping(offer: Offer): number | undefined {
  if (offer.verification.observedShipping !== undefined) return offer.verification.observedShipping;
  return offer.pricing.shipping;
}

export function computeTotal(offer: Offer): number | undefined {
  const shipping = knownShipping(offer);
  if (shipping === undefined) return undefined;
  let total = addMoney(currentPrice(offer), shipping, offer.pricing.duties ?? 0);
  if (offer.pricing.discount) total = subtractMoney(total, offer.pricing.discount);
  return total;
}

/**
 * Best-case total used only for ordering offers with unknown shipping:
 * the known components, understood as a lower bound, never shown as a total.
 */
export function lowerBoundTotal(offer: Offer): number {
  const shipping = knownShipping(offer) ?? 0;
  let total = addMoney(currentPrice(offer), shipping, offer.pricing.duties ?? 0);
  if (offer.pricing.discount) total = subtractMoney(total, offer.pricing.discount);
  return total;
}

export function hasKnownShipping(offer: Offer): boolean {
  return knownShipping(offer) !== undefined;
}

/** Recompute and store pricing.totalPrice after any price observation. */
export function withRecomputedTotal(offer: Offer): Offer {
  return {
    ...offer,
    pricing: { ...offer.pricing, totalPrice: computeTotal(offer) },
  };
}
