import { describe, expect, it } from "vitest";
import { applyHybridPolicy } from "../search/orchestrator";
import { executeSearch } from "../search/orchestrator";
import { parseIntentHeuristically } from "../intent/heuristic";
import { makeOffer } from "./helpers";
import type { Offer } from "../types";

function asDemo(offer: Offer, generic = false): Offer {
  return { ...offer, id: generic ? `demo-generic-${offer.id}` : `demo-${offer.id}`, discoverySource: "demo" };
}

function asLive(offer: Offer): Offer {
  return { ...offer, discoverySource: "google_shopping" };
}

describe("hybrid mode demo-offer policy", () => {
  it("hides all demo offers once any live offer matches", () => {
    const live = asLive(makeOffer({ price: 100, shipping: 0 }));
    const demoCurated = asDemo(makeOffer({ price: 90, shipping: 0 }));
    const demoGeneric = asDemo(makeOffer({ price: 80, shipping: 0 }), true);
    const demoRejected = asDemo(makeOffer({ price: 70, rejectionReason: "wrong size" }));

    const { matched, rejected } = applyHybridPolicy([live, demoCurated, demoGeneric], [demoRejected]);
    expect(matched).toEqual([live]);
    expect(rejected).toEqual([]);
  });

  it("falls back to curated demo scenarios, never fabricated generics", () => {
    const demoCurated = asDemo(makeOffer({ price: 90, shipping: 0 }));
    const demoGeneric = asDemo(makeOffer({ price: 80, shipping: 0 }), true);

    const { matched } = applyHybridPolicy([demoCurated, demoGeneric], []);
    expect(matched).toEqual([demoCurated]);
  });

  it("returns an honest empty result when only generics matched", () => {
    const demoGeneric = asDemo(makeOffer({ price: 80, shipping: 0 }), true);
    const { matched, rejected } = applyHybridPolicy([demoGeneric], [demoGeneric]);
    expect(matched).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("demo mode still serves generic offers for arbitrary queries", async () => {
    const intent = parseIntentHeuristically("Find a red mountain bike under 2000 PLN delivered");
    const result = await executeSearch(intent, { mode: "demo" });
    expect(result.winner).not.toBeNull(); // offline demo remains fully functional
  });
});
