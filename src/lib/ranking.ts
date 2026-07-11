import { compareMoney, toMinor } from "./money";
import { computeTotal, hasKnownShipping, lowerBoundTotal } from "./pricing";
import type { Offer, ShoppingIntent } from "./types";

/**
 * Deterministic ranking. The language model never chooses the winner.
 *
 * Order of criteria:
 *  1. Eligibility: matched, not rejected, not unavailable/mismatched.
 *  2. Lowest known total price.
 *  3. Tie-breakers (within PRICE_TIE_TOLERANCE): verified > unverifiable,
 *     known delivery > unknown, match score, trusted merchant, rating.
 */

const PRICE_TIE_TOLERANCE_MINOR = 500; // 5.00 in offer currency

/**
 * Offers with unknown shipping are ranked as if delivery cost a typical
 * courier fee, so an incomplete price can only win when it is genuinely
 * cheaper — never because missing data was treated as zero.
 */
const UNKNOWN_SHIPPING_ESTIMATE_MINOR = 1999;

export function isEligible(offer: Offer): boolean {
  if (offer.match.rejectionReason) return false;
  if (offer.verification.status === "unavailable") return false;
  if (offer.verification.status === "mismatched") return false;
  if (offer.availability.available === false) return false;
  return true;
}

export function withinBudget(offer: Offer, intent: ShoppingIntent): boolean {
  if (!intent.budget) return true;
  if (offer.pricing.currency !== intent.budget.currency) return false;
  const total = computeTotal(offer);
  if (intent.budget.includesShipping) {
    // Unknown shipping cannot prove the budget holds; use the lower bound
    // and keep such offers only as low-confidence candidates.
    const bound = total ?? lowerBoundTotal(offer);
    return compareMoney(bound, intent.budget.maximum) <= 0;
  }
  return compareMoney(lowerBoundTotalProductOnly(offer), intent.budget.maximum) <= 0;
}

function lowerBoundTotalProductOnly(offer: Offer): number {
  // Budget excludes shipping: compare the product price alone.
  return offer.verification.observedPrice ?? offer.pricing.pagePrice ?? offer.pricing.discoveredPrice;
}

function verificationRank(offer: Offer): number {
  switch (offer.verification.status) {
    case "verified":
    case "changed": // page was inspected; observed price already applied
      return 0;
    case "pending":
      return 1;
    case "unverifiable":
      return 2;
    default:
      return 3;
  }
}

/** Sort key: known-total offers by total, unknown-shipping by lower bound. */
function effectiveTotalMinor(offer: Offer): number {
  const total = computeTotal(offer);
  return toMinor(total ?? lowerBoundTotal(offer));
}

export function compareOffers(a: Offer, b: Offer): number {
  const priceDiff = effectiveTotalMinor(a) - effectiveTotalMinor(b);
  if (Math.abs(priceDiff) > PRICE_TIE_TOLERANCE_MINOR) return priceDiff;

  // Prices are equal or very close: prefer certainty.
  const verify = verificationRank(a) - verificationRank(b);
  if (verify !== 0) return verify;

  const shippingKnown = Number(hasKnownShipping(b)) - Number(hasKnownShipping(a));
  if (shippingKnown !== 0) return shippingKnown;

  const match = b.match.score - a.match.score;
  if (Math.abs(match) > 0.001) return match > 0 ? 1 : -1;

  const trusted = Number(b.merchant.trusted ?? false) - Number(a.merchant.trusted ?? false);
  if (trusted !== 0) return trusted;

  const rating = (b.merchant.rating ?? 0) - (a.merchant.rating ?? 0);
  if (rating !== 0) return rating > 0 ? 1 : -1;

  // Fully tied on quality: fall back to the exact price, then stable id.
  if (priceDiff !== 0) return priceDiff;
  return a.id.localeCompare(b.id);
}

export type RankOutcome = {
  winner: Offer | null;
  ranked: Offer[];
  rejected: Offer[];
  outOfBudget: Offer[];
  closestAboveBudget: Offer | null;
};

export function rankOffers(offers: Offer[], intent: ShoppingIntent): RankOutcome {
  const rejected: Offer[] = [];
  const outOfBudget: Offer[] = [];
  const eligible: Offer[] = [];

  for (const offer of offers) {
    if (!isEligible(offer)) {
      rejected.push(offer);
    } else if (!withinBudget(offer, intent)) {
      outOfBudget.push(offer);
    } else {
      eligible.push(offer);
    }
  }

  eligible.sort(compareOffers);
  outOfBudget.sort(compareOffers);

  return {
    winner: eligible[0] ?? null,
    ranked: eligible,
    rejected,
    outOfBudget,
    closestAboveBudget: eligible.length === 0 ? (outOfBudget[0] ?? null) : null,
  };
}
