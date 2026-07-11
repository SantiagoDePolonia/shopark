import { titleSimilarity } from "../matching";
import { moneyEquals } from "../money";
import { withRecomputedTotal } from "../pricing";
import { demoFixtureFor } from "../providers/demo";
import type { Offer } from "../types";
import { extractEvidence } from "./extract";
import { safeFetchHtml } from "./safe-fetch";

/**
 * Merchant-page verification. Discovery providers are candidate sources;
 * the merchant page is the source of truth for price and availability.
 */

/** How many of the cheapest matching offers get verified in parallel. */
export const VERIFY_TOP_N = 3;

/** Google redirect/search links can't be verified as merchant pages. */
function isAggregatorLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("google.com") || host.endsWith("google.pl");
  } catch {
    return true;
  }
}

function now(): string {
  return new Date().toISOString();
}

export async function verifyOffer(offer: Offer): Promise<Offer> {
  if (offer.discoverySource === "demo") return verifyDemoOffer(offer);
  return verifyLiveOffer(offer);
}

function verifyDemoOffer(offer: Offer): Offer {
  const fixture = demoFixtureFor(offer.id);
  const base: Offer["verification"] = {
    status: "pending",
    checkedAt: now(),
    evidenceSource: "demo",
    discoveredPrice: offer.pricing.discoveredPrice,
  };

  if (!fixture) {
    return withRecomputedTotal({
      ...offer,
      verification: { ...base, status: "unverifiable", reason: "No verification fixture found" },
    });
  }

  switch (fixture.outcome) {
    case "verified":
      return withRecomputedTotal({
        ...offer,
        verification: {
          ...base,
          status: "verified",
          observedPrice: offer.pricing.discoveredPrice,
          observedCurrency: offer.pricing.currency,
          observedAvailability: true,
        },
      });
    case "changed":
      return withRecomputedTotal({
        ...offer,
        pricing: { ...offer.pricing, pagePrice: fixture.observedPrice },
        verification: {
          ...base,
          status: "changed",
          reason: "The merchant page shows a different price than the discovery source",
          observedPrice: fixture.observedPrice,
          observedShipping: fixture.observedShipping,
          observedCurrency: offer.pricing.currency,
          observedAvailability: true,
        },
      });
    case "unverifiable":
      return withRecomputedTotal({
        ...offer,
        verification: { ...base, status: "unverifiable", reason: fixture.reason },
      });
    case "unavailable":
      return withRecomputedTotal({
        ...offer,
        availability: { ...offer.availability, available: false },
        verification: { ...base, status: "unavailable", reason: fixture.reason, observedAvailability: false },
      });
    case "mismatched":
      return withRecomputedTotal({
        ...offer,
        verification: { ...base, status: "mismatched", reason: fixture.reason },
      });
  }
}

async function verifyLiveOffer(offer: Offer): Promise<Offer> {
  const base: Offer["verification"] = {
    status: "pending",
    checkedAt: now(),
    discoveredPrice: offer.pricing.discoveredPrice,
  };

  if (isAggregatorLink(offer.url)) {
    return withRecomputedTotal({
      ...offer,
      verification: {
        ...base,
        status: "unverifiable",
        reason: "Only an aggregator link is available for this offer, not a direct merchant page",
      },
    });
  }

  const fetched = await safeFetchHtml(offer.url);
  if (!fetched.ok) {
    return withRecomputedTotal({
      ...offer,
      verification: { ...base, status: "unverifiable", reason: fetched.reason },
    });
  }

  const evidence = extractEvidence(fetched.html);
  if (!evidence || evidence.price === undefined) {
    return withRecomputedTotal({
      ...offer,
      verification: {
        ...base,
        status: "unverifiable",
        reason: "Could not read a price from the merchant page",
      },
    });
  }

  // Same-product check: GTIN when both sides have one, else title overlap.
  if (evidence.gtin && offer.product.gtin && evidence.gtin !== offer.product.gtin) {
    return withRecomputedTotal({
      ...offer,
      verification: {
        ...base,
        status: "mismatched",
        evidenceSource: evidence.source,
        reason: "The merchant page shows a product with a different GTIN",
      },
    });
  }
  if (evidence.title && titleSimilarity(offer.product.title, evidence.title) < 0.3) {
    return withRecomputedTotal({
      ...offer,
      verification: {
        ...base,
        status: "mismatched",
        evidenceSource: evidence.source,
        reason: "The merchant page appears to show a different product",
      },
    });
  }

  if (evidence.availability === false) {
    return withRecomputedTotal({
      ...offer,
      availability: { ...offer.availability, available: false },
      verification: {
        ...base,
        status: "unavailable",
        evidenceSource: evidence.source,
        reason: "The merchant page reports the product as out of stock",
        observedPrice: evidence.price,
        observedAvailability: false,
      },
    });
  }

  if (evidence.currency && evidence.currency !== offer.pricing.currency) {
    return withRecomputedTotal({
      ...offer,
      verification: {
        ...base,
        status: "unverifiable",
        evidenceSource: evidence.source,
        reason: `The merchant page prices in ${evidence.currency}, expected ${offer.pricing.currency}`,
      },
    });
  }

  const priceMatches = moneyEquals(evidence.price, offer.pricing.discoveredPrice, 1);
  const verification: Offer["verification"] = {
    ...base,
    status: priceMatches ? "verified" : "changed",
    evidenceSource: evidence.source,
    reason: priceMatches
      ? undefined
      : "The merchant page shows a different price than the discovery source",
    observedPrice: evidence.price,
    observedCurrency: evidence.currency ?? offer.pricing.currency,
    observedAvailability: evidence.availability ?? undefined,
    observedShipping: evidence.shipping,
  };

  return withRecomputedTotal({
    ...offer,
    pricing: { ...offer.pricing, pagePrice: evidence.price },
    verification,
  });
}

/** Verify the N cheapest candidates in parallel; leave the rest pending. */
export async function verifyTopCandidates(ranked: Offer[], topN = VERIFY_TOP_N): Promise<Offer[]> {
  const toVerify = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  const verified = await Promise.all(
    toVerify.map((offer) =>
      verifyOffer(offer).catch(() =>
        withRecomputedTotal({
          ...offer,
          verification: {
            status: "unverifiable" as const,
            checkedAt: now(),
            reason: "Verification failed unexpectedly",
          },
        }),
      ),
    ),
  );
  return [...verified, ...rest];
}
