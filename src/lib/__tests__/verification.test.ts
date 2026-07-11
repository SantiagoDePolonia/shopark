import { describe, expect, it } from "vitest";
import { extractJsonLd, extractMetadata, extractPageText } from "../verification/extract";
import { isBlockedIp, validateUrl } from "../verification/safe-fetch";

describe("safe fetch URL validation", () => {
  it("allows only https", async () => {
    expect((await validateUrl("http://example.com")).ok).toBe(false);
    expect((await validateUrl("ftp://example.com")).ok).toBe(false);
    expect((await validateUrl("not a url")).ok).toBe(false);
  });

  it("rejects localhost and internal hosts", async () => {
    expect((await validateUrl("https://localhost/admin")).ok).toBe(false);
    expect((await validateUrl("https://foo.internal/x")).ok).toBe(false);
    expect((await validateUrl("https://metadata.google.internal/x")).ok).toBe(false);
    expect((await validateUrl("https://user:pass@example.com/")).ok).toBe(false);
  });

  it("rejects private, link-local, and metadata IP ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true); // cloud metadata
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fd00::1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("142.250.75.14")).toBe(false);
  });

  it("rejects direct private-IP URLs", async () => {
    expect((await validateUrl("https://169.254.169.254/latest/meta-data")).ok).toBe(false);
    expect((await validateUrl("https://192.168.0.1/router")).ok).toBe(false);
  });
});

describe("JSON-LD extraction", () => {
  const page = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Nike Court Vision Low",
     "gtin13":"0194954687019","sku":"CV-43-W",
     "offers":{"@type":"Offer","price":"249.00","priceCurrency":"PLN",
       "availability":"https://schema.org/InStock"}}
    </script></head><body></body></html>`;

  it("reads price, currency, availability, gtin", () => {
    const evidence = extractJsonLd(page);
    expect(evidence).toMatchObject({
      source: "json_ld",
      title: "Nike Court Vision Low",
      price: 249,
      currency: "PLN",
      availability: true,
      gtin: "0194954687019",
    });
  });

  it("handles AggregateOffer and @graph", () => {
    const graphPage = `<script type="application/ld+json">
      {"@graph":[{"@type":"Product","name":"X","offers":{"@type":"AggregateOffer","lowPrice":199.5,"priceCurrency":"PLN","availability":"OutOfStock"}}]}
    </script>`;
    const evidence = extractJsonLd(graphPage);
    expect(evidence?.price).toBe(199.5);
    expect(evidence?.availability).toBe(false);
  });

  it("ignores malformed JSON", () => {
    expect(extractJsonLd(`<script type="application/ld+json">{broken</script>`)).toBeNull();
  });
});

describe("metadata and page-text extraction", () => {
  it("reads Open Graph product meta", () => {
    const page = `<meta property="og:title" content="Shoe"/>
      <meta property="product:price:amount" content="259.99"/>
      <meta property="product:price:currency" content="PLN"/>`;
    expect(extractMetadata(page)).toMatchObject({ source: "metadata", price: 259.99, currency: "PLN" });
  });

  it("falls back to visible page text", () => {
    const page = `<html><body><h1>Buty</h1><span class="price">249,99 zł</span></body></html>`;
    const evidence = extractPageText(page);
    expect(evidence?.price).toBe(249.99);
    expect(evidence?.currency).toBe("PLN");
  });

  it("detects sold-out wording in page text", () => {
    const page = `<body><p>249,99 zł</p><p>Out of stock</p></body>`;
    expect(extractPageText(page)?.availability).toBe(false);
  });
});
