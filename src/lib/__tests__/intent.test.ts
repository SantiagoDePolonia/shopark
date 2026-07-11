import { describe, expect, it } from "vitest";
import { buildConfirmation } from "../intent/confirmation";
import { parseIntentHeuristically } from "../intent/heuristic";
import { ShoppingIntentSchema } from "../types";

describe("intent validation", () => {
  it("accepts a full intent", () => {
    const result = ShoppingIntentSchema.safeParse({
      query: "white shoes",
      attributes: { size: "43", condition: "new" },
      budget: { maximum: 300, currency: "PLN", includesShipping: true },
      location: { country: "PL" },
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for attributes and location", () => {
    const result = ShoppingIntentSchema.parse({ query: "white shoes" });
    expect(result.attributes).toEqual({});
    expect(result.location.country).toBe("PL");
  });

  it("rejects invalid budgets and conditions", () => {
    expect(
      ShoppingIntentSchema.safeParse({
        query: "x",
        budget: { maximum: -5, currency: "PLN", includesShipping: true },
      }).success,
    ).toBe(false);
    expect(
      ShoppingIntentSchema.safeParse({ query: "x", attributes: { condition: "broken" } }).success,
    ).toBe(false);
  });
});

describe("heuristic parser", () => {
  it("extracts budget, size, color, condition, delivery inclusion", () => {
    const intent = parseIntentHeuristically(
      "Find me new white basketball shoes in size 43 for up to 300 PLN, including delivery",
    );
    expect(intent.budget).toEqual({ maximum: 300, currency: "PLN", includesShipping: true });
    expect(intent.attributes).toMatchObject({ size: "43", color: "white", condition: "new" });
  });

  it("extracts capacity and currency variants", () => {
    const intent = parseIntentHeuristically("1 TB portable SSD under 100 EUR");
    expect(intent.attributes.capacity).toBe("1TB");
    expect(intent.budget?.currency).toBe("EUR");
  });

  it("detects known brands", () => {
    expect(parseIntentHeuristically("sony headphones under 600 PLN").brand).toBe("Sony");
  });
});

describe("confirmation sentence", () => {
  it("summarizes the interpreted requirements", () => {
    const intent = parseIntentHeuristically(
      "Find me new white basketball shoes in size 43 for up to 300 PLN delivered",
    );
    intent.productCategory = "basketball shoes";
    const text = buildConfirmation(intent);
    expect(text).toContain("new");
    expect(text).toContain("white");
    expect(text).toContain("size 43");
    expect(text).toContain("300.00 PLN");
    expect(text).toContain("including delivery");
  });
});
