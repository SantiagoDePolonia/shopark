import { describe, expect, it } from "vitest";
import { computeTotal, currentPrice, withRecomputedTotal } from "../pricing";
import { rankOffers } from "../ranking";
import { deriveTags } from "../tags";
import { makeIntent, makeOffer } from "./helpers";

describe("total price calculation", () => {
  it("adds product, shipping, minus discount", () => {
    const offer = makeOffer({ price: 249, shipping: 10.99, discount: 10 });
    expect(computeTotal(offer)).toBe(249.99);
  });

  it("returns undefined when shipping is unknown (never assumes zero)", () => {
    const offer = makeOffer({ price: 249 });
    expect(computeTotal(offer)).toBeUndefined();
  });

  it("prefers the observed page price over discovery", () => {
    const offer = makeOffer({ price: 229, shipping: 12.99, observedPrice: 289 });
    expect(currentPrice(offer)).toBe(289);
    expect(computeTotal(offer)).toBe(301.99);
  });

  it("recomputes stored totals", () => {
    const offer = withRecomputedTotal(makeOffer({ price: 100, shipping: 0 }));
    expect(offer.pricing.totalPrice).toBe(100);
  });
});

describe("deterministic ranking", () => {
  const intent = makeIntent();

  it("lowest known total wins, not lowest sticker price", () => {
    const stickerTrap = makeOffer({ id: "trap", price: 239, shipping: 39.99 }); // 278.99
    const honest = makeOffer({ id: "honest", price: 249, shipping: 10.99 }); // 259.99
    const { winner } = rankOffers([stickerTrap, honest], intent);
    expect(winner?.id).toBe("honest");
  });

  it("unavailable and mismatched offers cannot win", () => {
    const unavailable = makeOffer({ id: "gone", price: 100, shipping: 0, verificationStatus: "unavailable", available: false });
    const mismatched = makeOffer({ id: "wrong", price: 110, shipping: 0, verificationStatus: "mismatched" });
    const ok = makeOffer({ id: "ok", price: 259.99, shipping: 0, verificationStatus: "verified" });
    const outcome = rankOffers([unavailable, mismatched, ok], intent);
    expect(outcome.winner?.id).toBe("ok");
    expect(outcome.rejected.map((o) => o.id).sort()).toEqual(["gone", "wrong"]);
  });

  it("rejected matches cannot win", () => {
    const rejected = makeOffer({ id: "rej", price: 10, shipping: 0, rejectionReason: "wrong size" });
    const ok = makeOffer({ id: "ok", price: 200, shipping: 0 });
    expect(rankOffers([rejected, ok], intent).winner?.id).toBe("ok");
  });

  it("a changed price is reranked using the observed price", () => {
    const stale = makeOffer({
      id: "stale",
      price: 229,
      shipping: 12.99,
      verificationStatus: "changed",
      observedPrice: 289, // real total 301.99 — over budget
    });
    const honest = makeOffer({ id: "honest", price: 249, shipping: 10.99, verificationStatus: "verified" });
    const outcome = rankOffers([stale, honest], intent);
    expect(outcome.winner?.id).toBe("honest");
    // 301.99 > 300 budget → out of budget entirely
    expect(outcome.ranked.find((o) => o.id === "stale")).toBeUndefined();
  });

  it("unknown shipping is penalized, not treated as free", () => {
    const unknownShip = makeOffer({ id: "unknown", price: 254 }); // bound 254 + 19.99 penalty
    const known = makeOffer({ id: "known", price: 249, shipping: 10.99 }); // 259.99
    expect(rankOffers([unknownShip, known], intent).winner?.id).toBe("known");
  });

  it("an unverifiable offer may still win when genuinely cheapest", () => {
    const unverifiable = makeOffer({ id: "u", price: 199, shipping: 0, verificationStatus: "unverifiable" });
    const verified = makeOffer({ id: "v", price: 259.99, shipping: 0, verificationStatus: "verified" });
    expect(rankOffers([unverifiable, verified], intent).winner?.id).toBe("u");
  });

  it("near ties prefer verified over unverifiable", () => {
    const unverifiable = makeOffer({ id: "u", price: 258, shipping: 0, verificationStatus: "unverifiable" });
    const verified = makeOffer({ id: "v", price: 259.99, shipping: 0, verificationStatus: "verified" });
    expect(rankOffers([unverifiable, verified], intent).winner?.id).toBe("v");
  });

  it("budget is enforced against the total, with the closest match surfaced", () => {
    const overBudget = makeOffer({ id: "over", price: 305, shipping: 14.99, verificationStatus: "verified" });
    const outcome = rankOffers([overBudget], intent);
    expect(outcome.winner).toBeNull();
    expect(outcome.closestAboveBudget?.id).toBe("over");
  });

  it("currency mismatch never satisfies the budget", () => {
    const eur = makeOffer({ id: "eur", price: 60, shipping: 0, currency: "EUR" });
    expect(rankOffers([eur], intent).winner).toBeNull();
  });
});

describe("tags", () => {
  it("derives tags only from evidence", () => {
    const offer = makeOffer({
      price: 249,
      shipping: 0,
      verificationStatus: "verified",
      quantityRemaining: 2,
      trusted: true,
      couponRequired: true,
    });
    const tags = deriveTags(offer, { isLowestPrice: true, isSimilarProduct: false });
    expect(tags).toContain("Lowest price");
    expect(tags).toContain("Price verified");
    expect(tags).toContain("Free delivery");
    expect(tags).toContain("Limited stock");
    expect(tags).toContain("Trusted merchant");
    expect(tags).toContain("Coupon required");
    expect(tags).toContain("New");
  });

  it("marks unknown shipping and dropped prices", () => {
    const offer = makeOffer({ price: 249, verificationStatus: "changed", observedPrice: 219 });
    offer.verification.discoveredPrice = 249;
    const tags = deriveTags(offer, { isLowestPrice: false, isSimilarProduct: true });
    expect(tags).toContain("Shipping unknown");
    expect(tags).toContain("Price dropped");
    expect(tags).toContain("Similar product");
  });
});
