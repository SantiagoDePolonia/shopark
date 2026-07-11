import type { Offer } from "../types";

/**
 * Deterministic demo catalog.
 *
 * The basketball-shoe scenario is the primary seeded demo:
 * it contains every trap ShopArk is designed to catch, so the result
 * demonstrates why verified total price beats sorting by sticker price.
 */

type DemoOffer = Omit<Offer, "match" | "tags" | "verification"> & {
  /** Outcome the demo verification service will report for this offer. */
  fixture: DemoVerificationFixture;
};

export type DemoVerificationFixture =
  | { outcome: "verified" }
  | { outcome: "changed"; observedPrice: number; observedShipping?: number }
  | { outcome: "unverifiable"; reason: string }
  | { outcome: "unavailable"; reason: string }
  | { outcome: "mismatched"; reason: string };

const DEMO_URL = (slug: string) => `https://demo-merchants.shopark.local/${slug}`;

function shoe(
  id: string,
  merchant: DemoOffer["merchant"],
  overrides: {
    title?: string;
    model?: string;
    size?: string;
    condition?: Offer["product"]["condition"];
    price: number;
    shipping?: number;
    oldPrice?: number;
    discount?: number;
    couponRequired?: boolean;
    couponDescription?: string;
    available?: boolean;
    quantityRemaining?: number;
    gtin?: string;
    color?: string;
    gender?: string;
    imageSeed?: string;
  },
  fixture: DemoVerificationFixture,
): DemoOffer {
  return {
    id: `demo-${id}`,
    discoverySource: "demo",
    merchant,
    product: {
      title: overrides.title ?? "Nike Court Vision Low White",
      brand: "Nike",
      model: overrides.model ?? "Court Vision Low",
      gtin: overrides.gtin,
      category: "basketball shoes",
      condition: overrides.condition ?? "new",
      attributes: {
        size: overrides.size ?? "43",
        color: overrides.color ?? "white",
        ...(overrides.gender ? { gender: overrides.gender } : {}),
      },
    },
    pricing: {
      discoveredPrice: overrides.price,
      shipping: overrides.shipping,
      oldPrice: overrides.oldPrice,
      discount: overrides.discount,
      couponRequired: overrides.couponRequired,
      couponDescription: overrides.couponDescription,
      currency: "PLN",
    },
    availability: {
      available: overrides.available,
      quantityRemaining: overrides.quantityRemaining,
    },
    url: DEMO_URL(`offer/${id}`),
    imageUrl: `/demo-products/${overrides.imageSeed ?? "shoe-white"}.svg`,
    fixture,
  };
}

export const BASKETBALL_SHOE_OFFERS: DemoOffer[] = [
  // 1. The intended winner: verified, honest total 259.99 PLN.
  shoe(
    "shoe-winner",
    { name: "SportOutlet.pl", domain: "sportoutlet.pl", rating: 4.8, reviewCount: 2312, trusted: true },
    { price: 249.0, shipping: 10.99, gtin: "0194954687019" },
    { outcome: "verified" },
  ),
  // 2. Lower sticker price, expensive delivery: 239 + 39.99 = 278.99.
  shoe(
    "shoe-shipping-trap",
    { name: "eSneakers.pl", domain: "esneakers.pl", rating: 4.3, reviewCount: 480 },
    { price: 239.0, shipping: 39.99, gtin: "0194954687019" },
    { outcome: "verified" },
  ),
  // 3. Wrong size: rejected before verification.
  shoe(
    "shoe-wrong-size",
    { name: "ButyMarket.pl", domain: "butymarket.pl", rating: 4.1, reviewCount: 210 },
    { price: 219.0, shipping: 9.99, size: "42", gtin: "0194954687002" },
    { outcome: "verified" },
  ),
  // 4. Used item: rejected when the user asked for new.
  shoe(
    "shoe-used",
    { name: "SecondKicks.pl", domain: "secondkicks.pl", rating: 4.5, reviewCount: 95 },
    { price: 149.0, shipping: 12.99, condition: "used" },
    { outcome: "verified" },
  ),
  // 5. Unavailable: discovery says it exists, the page says sold out.
  shoe(
    "shoe-unavailable",
    { name: "BestButy.pl", domain: "bestbuty.pl", rating: 4.0, reviewCount: 150 },
    { price: 199.0, shipping: 0, gtin: "0194954687019" },
    { outcome: "unavailable", reason: "Size 43 is sold out on the merchant page" },
  ),
  // 6. Stale discovery price: page now shows 289.00 → status "changed", reranked.
  shoe(
    "shoe-stale-price",
    { name: "MegaSport.pl", domain: "megasport.pl", rating: 4.6, reviewCount: 1024 },
    { price: 229.0, shipping: 12.99, gtin: "0194954687019" },
    { outcome: "changed", observedPrice: 289.0 },
  ),
  // 7. Fake discount: inflated "old price" makes −46% look like a bargain.
  shoe(
    "shoe-fake-discount",
    { name: "PromoKing.pl", domain: "promoking.pl", rating: 3.9, reviewCount: 67 },
    { price: 269.99, shipping: 9.99, oldPrice: 499.0 },
    { outcome: "verified" },
  ),
  // 8. Coupon-dependent price: honest total needs an app coupon.
  shoe(
    "shoe-coupon",
    { name: "SneakerApp.pl", domain: "sneakerapp.pl", rating: 4.4, reviewCount: 320 },
    {
      price: 255.0,
      shipping: 9.99,
      couponRequired: true,
      couponDescription: "Requires APP10 coupon in the merchant app",
      gtin: "0194954687019",
    },
    { outcome: "verified" },
  ),
  // 9. Unknown shipping: never treated as free.
  shoe(
    "shoe-unknown-shipping",
    { name: "ShoeBazar.pl", domain: "shoebazar.pl", rating: 4.2, reviewCount: 89 },
    { price: 254.0, shipping: undefined, gtin: "0194954687019" },
    { outcome: "verified" },
  ),
  // 10. Page cannot be verified: bot protection blocks the check.
  shoe(
    "shoe-unverifiable",
    { name: "TurboSport.pl", domain: "turbosport.pl", rating: 4.5, reviewCount: 540 },
    { price: 264.99, shipping: 9.99, gtin: "0194954687019" },
    { outcome: "unverifiable", reason: "The merchant blocked automated verification" },
  ),
  // 11. Product-page mismatch: link leads to a different model.
  shoe(
    "shoe-mismatch",
    { name: "OkazjeSport.pl", domain: "okazjesport.pl", rating: 3.8, reviewCount: 41 },
    { price: 244.0, shipping: 9.99 },
    { outcome: "mismatched", reason: "The page shows Nike Court Vision Mid, not the Low model" },
  ),
  // 12+. Valid alternatives: same product, other merchants.
  shoe(
    "shoe-alt-freeship",
    { name: "eObuwie.pl", domain: "eobuwie.pl", rating: 4.7, reviewCount: 15800, trusted: true },
    { price: 269.99, shipping: 0, gtin: "0194954687019" },
    { outcome: "verified" },
  ),
  shoe(
    "shoe-alt-2",
    { name: "SportDirect.pl", domain: "sportdirect.pl", rating: 4.4, reviewCount: 3100 },
    { price: 259.0, shipping: 15.0, gtin: "0194954687019", quantityRemaining: 2 },
    { outcome: "verified" },
  ),
  // Similar products (different model) that also satisfy the request.
  shoe(
    "shoe-similar-adidas",
    { name: "SportOutlet.pl", domain: "sportoutlet.pl", rating: 4.8, reviewCount: 2312, trusted: true },
    {
      title: "Adidas Hoops 3.0 Low White",
      model: "Hoops 3.0",
      price: 269.0,
      shipping: 9.99,
      gtin: "4066748571239",
      imageSeed: "shoe-white-2",
    },
    { outcome: "verified" },
  ),
  shoe(
    "shoe-similar-puma",
    { name: "eObuwie.pl", domain: "eobuwie.pl", rating: 4.7, reviewCount: 15800, trusted: true },
    {
      title: "Puma Rebound v6 Low White",
      model: "Rebound v6",
      price: 279.0,
      shipping: 0,
      gtin: "4099683021456",
      imageSeed: "shoe-white-3",
    },
    { outcome: "verified" },
  ),
];

// Patch brand for the non-Nike similar products.
for (const o of BASKETBALL_SHOE_OFFERS) {
  if (o.id === "demo-shoe-similar-adidas") o.product.brand = "Adidas";
  if (o.id === "demo-shoe-similar-puma") o.product.brand = "Puma";
}

/* ------------------------------------------------------------------ */
/* Headphones scenario                                                 */
/* ------------------------------------------------------------------ */

function simpleOffer(
  id: string,
  base: {
    title: string;
    brand: string;
    model: string;
    category: string;
    merchant: DemoOffer["merchant"];
    price: number;
    shipping?: number;
    condition?: Offer["product"]["condition"];
    attributes?: Record<string, string>;
    gtin?: string;
    imageSeed: string;
  },
  fixture: DemoVerificationFixture,
): DemoOffer {
  return {
    id: `demo-${id}`,
    discoverySource: "demo",
    merchant: base.merchant,
    product: {
      title: base.title,
      brand: base.brand,
      model: base.model,
      gtin: base.gtin,
      category: base.category,
      condition: base.condition ?? "new",
      attributes: base.attributes ?? {},
    },
    pricing: {
      discoveredPrice: base.price,
      shipping: base.shipping,
      currency: "PLN",
    },
    availability: {},
    url: DEMO_URL(`offer/${id}`),
    imageUrl: `/demo-products/${base.imageSeed}.svg`,
    fixture,
  };
}

export const HEADPHONE_OFFERS: DemoOffer[] = [
  simpleOffer(
    "hp-winner",
    {
      title: "Sony WH-CH720N Wireless Noise Cancelling Headphones Black",
      brand: "Sony",
      model: "WH-CH720N",
      category: "noise-cancelling headphones",
      merchant: { name: "MediaExpert.pl", domain: "mediaexpert.pl", rating: 4.6, reviewCount: 21000, trusted: true },
      price: 449.0,
      shipping: 0,
      gtin: "4548736143723",
      attributes: { color: "black", noiseCancelling: "yes" },
      imageSeed: "headphones-1",
    },
    { outcome: "verified" },
  ),
  simpleOffer(
    "hp-stale",
    {
      title: "Sony WH-CH720N Noise Cancelling Headphones",
      brand: "Sony",
      model: "WH-CH720N",
      category: "noise-cancelling headphones",
      merchant: { name: "AudioTanio.pl", domain: "audiotanio.pl", rating: 4.1, reviewCount: 340 },
      price: 399.0,
      shipping: 14.99,
      gtin: "4548736143723",
      attributes: { noiseCancelling: "yes" },
      imageSeed: "headphones-1",
    },
    { outcome: "changed", observedPrice: 469.0 },
  ),
  simpleOffer(
    "hp-alt",
    {
      title: "JBL Tune 770NC Wireless Noise Cancelling Headphones",
      brand: "JBL",
      model: "Tune 770NC",
      category: "noise-cancelling headphones",
      merchant: { name: "RTV Euro AGD", domain: "euro.com.pl", rating: 4.5, reviewCount: 18500, trusted: true },
      price: 499.0,
      shipping: 0,
      gtin: "6925281974571",
      attributes: { noiseCancelling: "yes" },
      imageSeed: "headphones-2",
    },
    { outcome: "verified" },
  ),
  simpleOffer(
    "hp-unverifiable",
    {
      title: "Sony WH-CH720N Headphones",
      brand: "Sony",
      model: "WH-CH720N",
      category: "noise-cancelling headphones",
      merchant: { name: "SluchawkiOnline.pl", domain: "sluchawkionline.pl", rating: 3.9, reviewCount: 120 },
      price: 439.0,
      shipping: undefined,
      gtin: "4548736143723",
      attributes: { noiseCancelling: "yes" },
      imageSeed: "headphones-1",
    },
    { outcome: "unverifiable", reason: "Request to the merchant page timed out" },
  ),
];

export const SSD_OFFERS: DemoOffer[] = [
  simpleOffer(
    "ssd-winner",
    {
      title: "Samsung T7 Portable SSD 1TB USB-C Grey",
      brand: "Samsung",
      model: "T7",
      category: "portable SSD",
      merchant: { name: "X-Kom.pl", domain: "x-kom.pl", rating: 4.7, reviewCount: 42000, trusted: true },
      price: 359.0,
      shipping: 0,
      gtin: "8806090312397",
      attributes: { capacity: "1TB", interface: "USB-C" },
      imageSeed: "ssd-1",
    },
    { outcome: "verified" },
  ),
  simpleOffer(
    "ssd-wrong-capacity",
    {
      title: "Samsung T7 Portable SSD 500GB USB-C",
      brand: "Samsung",
      model: "T7",
      category: "portable SSD",
      merchant: { name: "Morele.net", domain: "morele.net", rating: 4.4, reviewCount: 28000 },
      price: 249.0,
      shipping: 9.99,
      attributes: { capacity: "500GB", interface: "USB-C" },
      imageSeed: "ssd-1",
    },
    { outcome: "verified" },
  ),
  simpleOffer(
    "ssd-alt",
    {
      title: "SanDisk Extreme Portable SSD 1TB USB-C",
      brand: "SanDisk",
      model: "Extreme Portable",
      category: "portable SSD",
      merchant: { name: "MediaMarkt.pl", domain: "mediamarkt.pl", rating: 4.5, reviewCount: 16000, trusted: true },
      price: 389.0,
      shipping: 0,
      gtin: "0619659184469",
      attributes: { capacity: "1TB", interface: "USB-C" },
      imageSeed: "ssd-2",
    },
    { outcome: "verified" },
  ),
  simpleOffer(
    "ssd-unavailable",
    {
      title: "Samsung T7 Portable SSD 1TB USB-C",
      brand: "Samsung",
      model: "T7",
      category: "portable SSD",
      merchant: { name: "TanieDyski.pl", domain: "taniedyski.pl", rating: 4.0, reviewCount: 210 },
      price: 329.0,
      shipping: 12.99,
      gtin: "8806090312397",
      attributes: { capacity: "1TB", interface: "USB-C" },
      imageSeed: "ssd-1",
    },
    { outcome: "unavailable", reason: "Listed as out of stock on the merchant page" },
  ),
];

export type { DemoOffer };
