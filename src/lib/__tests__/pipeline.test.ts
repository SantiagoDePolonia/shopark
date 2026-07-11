import { describe, expect, it } from "vitest";
import { executeSearch } from "../search/orchestrator";
import { parseIntentHeuristically } from "../intent/heuristic";
import { computeTotal } from "../pricing";

/**
 * End-to-end evaluation over the deterministic demo dataset — the same
 * scenario the live demo uses. Measures strike precision and false-buy
 * safety on known traps.
 */

describe("demo pipeline: basketball shoes scenario", () => {
  const intent = parseIntentHeuristically(
    "Find me new white basketball shoes in size 43 for up to 300 PLN, including delivery",
  );

  it("parses the demo prompt correctly", () => {
    expect(intent.attributes.size).toBe("43");
    expect(intent.attributes.color).toBe("white");
    expect(intent.attributes.condition).toBe("new");
    expect(intent.budget).toEqual({ maximum: 300, currency: "PLN", includesShipping: true });
  });

  it("selects the verified honest-total winner and rejects every trap", async () => {
    const result = await executeSearch(intent, { mode: "demo" });

    // Strike precision: the intended winner, on verified total price.
    expect(result.winner?.id).toBe("demo-shoe-winner");
    expect(result.winner?.verification.status).toBe("verified");
    expect(computeTotal(result.winner!)).toBe(259.99);

    // False-buy rate: none of the traps may win or appear as safe alternatives.
    const recommendedIds = [
      result.winner!.id,
      ...result.sameProductAlternatives.map((o) => o.id),
      ...result.similarAlternatives.map((o) => o.id),
    ];
    expect(recommendedIds).not.toContain("demo-shoe-wrong-size");
    expect(recommendedIds).not.toContain("demo-shoe-used");
    expect(recommendedIds).not.toContain("demo-shoe-unavailable");
    expect(recommendedIds).not.toContain("demo-shoe-mismatch");

    // The stale price was re-checked: observed 289 + 12.99 shipping ≈ 301.99 > budget.
    expect(recommendedIds).not.toContain("demo-shoe-stale-price");

    // The shipping trap survives as an alternative but never as the winner.
    expect(result.winner!.id).not.toBe("demo-shoe-shipping-trap");

    // Rejected traps carry reasons for the UI.
    const rejectedIds = result.rejected.map((o) => o.id);
    expect(rejectedIds).toEqual(
      expect.arrayContaining(["demo-shoe-wrong-size", "demo-shoe-used", "demo-shoe-unavailable", "demo-shoe-mismatch"]),
    );

    // Alternatives are split into same-product and similar.
    expect(result.sameProductAlternatives.length).toBeGreaterThan(0);
    expect(result.similarAlternatives.map((o) => o.id)).toEqual(
      expect.arrayContaining(["demo-shoe-similar-adidas", "demo-shoe-similar-puma"]),
    );

    // Summary uses careful language, never absolute claims.
    expect(result.summary.toLowerCase()).not.toContain("cheapest on the internet");
    expect(result.summary.toLowerCase()).not.toContain("guaranteed");
  });

  it("reports the closest match when nothing fits the budget", async () => {
    const tightIntent = { ...intent, budget: { maximum: 100, currency: "PLN" as const, includesShipping: true } };
    const result = await executeSearch(tightIntent, { mode: "demo" });
    expect(result.winner).toBeNull();
    expect(result.summary).toContain("No matching verified offer was found below 100.00 PLN");
  });
});

describe("demo pipeline: other seeded scenarios", () => {
  it("headphones: winner is verified and within budget", async () => {
    const intent = parseIntentHeuristically("Find noise-cancelling headphones under 600 PLN");
    const result = await executeSearch(intent, { mode: "demo" });
    expect(result.winner).not.toBeNull();
    expect(["verified", "changed"]).toContain(result.winner!.verification.status);
    expect(computeTotal(result.winner!)!).toBeLessThanOrEqual(600);
  });

  it("SSD: wrong capacity is rejected", async () => {
    const intent = parseIntentHeuristically("Find a 1 TB portable SSD with USB-C under 400 PLN");
    const result = await executeSearch(intent, { mode: "demo" });
    expect(result.winner?.id).toBe("demo-ssd-winner");
    const allShown = [
      result.winner!.id,
      ...result.sameProductAlternatives.map((o) => o.id),
      ...result.similarAlternatives.map((o) => o.id),
    ];
    expect(allShown).not.toContain("demo-ssd-wrong-capacity");
    expect(allShown).not.toContain("demo-ssd-unavailable");
  });

  it("arbitrary queries still produce a deterministic result", async () => {
    const intent = parseIntentHeuristically("Find a red mountain bike under 2000 PLN delivered");
    const first = await executeSearch(intent, { mode: "demo" });
    const second = await executeSearch(intent, { mode: "demo" });
    expect(first.winner).not.toBeNull();
    expect(first.winner!.id).toBe(second.winner!.id);
    expect(computeTotal(first.winner!)).toBe(computeTotal(second.winner!));
  });
});
