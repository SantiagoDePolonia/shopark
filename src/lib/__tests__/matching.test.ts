import { describe, expect, it } from "vitest";
import { matchOffer, normalizeCapacity, normalizeSize, productIdentity, titleSimilarity } from "../matching";
import { makeIntent, makeOffer } from "./helpers";

describe("attribute normalization", () => {
  it("normalizes sizes", () => {
    expect(normalizeSize("EU 43")).toBe("43");
    expect(normalizeSize("43.0")).toBe("43");
    expect(normalizeSize("43,5")).toBe("43.5");
    expect(normalizeSize("43")).toBe("43");
  });

  it("normalizes capacities to GB", () => {
    expect(normalizeCapacity("1TB")).toBe("1000");
    expect(normalizeCapacity("1 TB")).toBe("1000");
    expect(normalizeCapacity("1000 GB")).toBe("1000");
    expect(normalizeCapacity("500GB")).toBe("500");
  });
});

describe("critical attribute enforcement", () => {
  const intent = makeIntent();

  it("rejects a wrong size even with a perfect title", () => {
    const offer = makeOffer({ price: 100, attributes: { size: "42", color: "white" } });
    const result = matchOffer(intent, offer);
    expect(result.rejectionReason).toMatch(/size/i);
    expect(result.score).toBe(0);
  });

  it("rejects a used item when new was requested", () => {
    const offer = makeOffer({ price: 100, condition: "used" });
    expect(matchOffer(intent, offer).rejectionReason).toMatch(/condition/i);
  });

  it("rejects a conflicting color", () => {
    const offer = makeOffer({ price: 100, attributes: { size: "43", color: "black" } });
    expect(matchOffer(intent, offer).rejectionReason).toMatch(/color/i);
  });

  it("rejects wrong storage capacity", () => {
    const ssdIntent = makeIntent({
      query: "1TB portable SSD USB-C",
      productCategory: "portable SSD",
      attributes: { capacity: "1TB" },
    });
    const offer = makeOffer({
      title: "Samsung T7 Portable SSD 500GB",
      brand: "Samsung",
      model: "T7",
      price: 100,
      attributes: { capacity: "500GB" },
    });
    expect(matchOffer(ssdIntent, offer).rejectionReason).toMatch(/capacity/i);
  });

  it("accepts a matching offer and explains why", () => {
    const offer = makeOffer({ price: 249, attributes: { size: "43", color: "white" } });
    const result = matchOffer(intent, offer);
    expect(result.rejectionReason).toBeUndefined();
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.reasons).toContain("Size 43 is available");
  });

  it("high similarity never overrides a size conflict", () => {
    const offer = makeOffer({
      title: "New white basketball shoes size 43 under 300 PLN delivered", // identical to query
      price: 100,
      attributes: { size: "41" },
    });
    expect(matchOffer(intent, offer).rejectionReason).toBeDefined();
  });
});

describe("titleSimilarity", () => {
  it("scores overlapping tokens", () => {
    expect(titleSimilarity("white basketball shoes", "White Basketball Shoes Pro")).toBe(1);
    expect(titleSimilarity("white basketball shoes", "garden hose")).toBe(0);
  });
});

describe("productIdentity", () => {
  it("prefers GTIN, then brand+model, then title", () => {
    const withGtin = makeOffer({ price: 1, gtin: "123" });
    expect(productIdentity(withGtin)).toBe("gtin:123");

    const brandModel = makeOffer({ price: 1 });
    expect(productIdentity(brandModel)).toBe("bm:nike:court vision low");

    const bare = makeOffer({ price: 1, brand: undefined as never, model: undefined as never, title: "Mystery Shoe X" });
    bare.product.brand = undefined;
    bare.product.model = undefined;
    expect(productIdentity(bare)).toBe("title:mystery shoe x");
  });

  it("groups the same product across merchants", () => {
    const a = makeOffer({ price: 249, gtin: "0194954687019" });
    const b = makeOffer({ price: 270, gtin: "0194954687019" });
    expect(productIdentity(a)).toBe(productIdentity(b));
  });
});

describe("liberal matching improvements", () => {
  it("folds Polish ł and diacritics in tokens", () => {
    expect(titleSimilarity("okulary przeciwsloneczne", "Okulary Przeciwsłoneczne Damskie")).toBe(1);
  });

  it("rejects a different model generation", () => {
    const intent = makeIntent({
      query: "iPhone sixteen",
      searchQuery: "iphone 16",
      attributes: {},
      budget: undefined,
    });
    const offer = makeOffer({
      title: "Apple iPhone 14 Dual SIM iOS 16 5G",
      brand: "Apple",
      model: undefined,
      price: 1200,
      attributes: {},
    });
    const result = matchOffer(intent, offer);
    expect(result.rejectionReason).toMatch(/iphone 14/i);
  });

  it("matches the local-language title via localizedQuery", () => {
    const intent = makeIntent({
      query: "Sunglasses",
      searchQuery: "sunglasses",
      localizedQuery: "okulary przeciwsloneczne",
      productCategory: "accessories",
      attributes: {},
      budget: undefined,
    });
    const offer = makeOffer({
      title: "Okulary przeciwsłoneczne Ray-Ban Aviator",
      brand: undefined,
      model: undefined,
      price: 300,
      attributes: {},
    });
    const result = matchOffer(intent, offer);
    expect(result.rejectionReason).toBeUndefined();
    expect(result.score).toBeGreaterThan(0.3);
  });
});
