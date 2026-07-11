import { describe, expect, it } from "vitest";
import { dfsItemToOffer, parseDfsResponse } from "../providers/dataforseo";
import { makeIntent } from "./helpers";

const intent = makeIntent();

describe("DataForSEO response parsing", () => {
  it("maps a full item to a normalized offer", () => {
    const offer = dfsItemToOffer(
      {
        type: "google_shopping_serp",
        title: "Nike Court Vision Low White / 43 /",
        seller: "SportShop.pl",
        price: { current: 249.0, currency: "PLN" },
        product_id: "abc123",
        url: "https://sportshop.pl/nike-court-vision-low",
        delivery_info: { delivery_price: { current: 10.99, currency: "PLN" } },
        rating: { value: 4.6, votes_count: 812 },
      },
      intent,
      0,
    );
    expect(offer).toMatchObject({
      id: "dfs-abc123",
      discoverySource: "google_shopping",
      merchant: { name: "SportShop.pl", rating: 4.6, reviewCount: 812 },
      pricing: { discoveredPrice: 249, shipping: 10.99, currency: "PLN" },
      url: "https://sportshop.pl/nike-court-vision-low",
    });
    expect(offer?.product.attributes.size).toBe("43");
    expect(offer?.product.condition).toBe("new");
  });

  it("handles numeric prices, free-delivery messages, and used markers", () => {
    const offer = dfsItemToOffer(
      {
        title: "Nike Court Vision Low used",
        seller: "X",
        price: 199,
        url: "https://x.pl/p",
        delivery_info: { delivery_message: "Free delivery" },
      },
      intent,
      3,
    );
    expect(offer?.pricing.shipping).toBe(0);
    expect(offer?.product.condition).toBe("used");
    expect(offer?.pricing.currency).toBe("PLN"); // falls back to budget currency
  });

  it("drops items without price, title, or url", () => {
    expect(dfsItemToOffer({ title: "X", url: "https://x.pl" }, intent, 0)).toBeNull();
    expect(dfsItemToOffer({ price: 10, url: "https://x.pl" }, intent, 0)).toBeNull();
    expect(dfsItemToOffer({ title: "X", price: 10 }, intent, 0)).toBeNull();
  });

  it("missing delivery info stays unknown, never zero", () => {
    const offer = dfsItemToOffer({ title: "X", price: 10, url: "https://x.pl/p" }, intent, 0);
    expect(offer?.pricing.shipping).toBeUndefined();
  });

  it("surfaces API-level errors instead of failing the search", () => {
    const outcome = parseDfsResponse(
      { status_code: 40104, status_message: "Please verify your account" },
      intent,
    );
    expect(outcome.offers).toEqual([]);
    expect(outcome.error).toContain("verify your account");
  });

  it("surfaces task-level errors", () => {
    const outcome = parseDfsResponse(
      { status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid field" }] },
      intent,
    );
    expect(outcome.error).toContain("Invalid field");
  });

  it("flattens items across result pages", () => {
    const outcome = parseDfsResponse(
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              { items: [{ title: "A", price: 10, url: "https://a.pl/1" }] },
              { items: [{ title: "B", price: 20, url: "https://b.pl/2" }] },
            ],
          },
        ],
      },
      intent,
    );
    expect(outcome.offers).toHaveLength(2);
    expect(outcome.error).toBeUndefined();
  });
});

describe("safeOfferUrl", () => {
  it("replaces fragile Google Shopping deep-links with a plain search", async () => {
    const { safeOfferUrl } = await import("../providers/geo");
    const fragile =
      "https://google.pl/search?ibp=oshop&q=okulary&prds=catalogid:8135582137938117201,productid:750326640359415512";
    const fixed = safeOfferUrl(fragile, "Okulary Ray-Ban Aviator", "OpticalStore.pl");
    expect(fixed).toBe(
      `https://www.google.com/search?q=${encodeURIComponent("Okulary Ray-Ban Aviator OpticalStore.pl")}&udm=28&gl=pl`,
    );
  });

  it("leaves direct merchant URLs untouched", async () => {
    const { safeOfferUrl } = await import("../providers/geo");
    const direct = "https://sportoutlet.pl/nike-court-vision-low?variant=43";
    expect(safeOfferUrl(direct, "Nike", "SportOutlet")).toBe(direct);
    const plainGoogle = "https://www.google.com/search?q=nike+shoes";
    expect(safeOfferUrl(plainGoogle, "Nike", "X")).toBe(plainGoogle);
  });
});
