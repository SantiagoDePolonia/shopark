import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-hardened page fetcher for merchant verification.
 *
 * HTTPS only, public IPs only, redirects re-validated hop by hop,
 * bounded response size, HTML content type required.
 */

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 5_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; ShopArkVerifier/1.0; +https://shopark.local/verifier)";

export type SafeFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string };

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:") // v4-mapped; re-checked as v4 below
  );
}

export function isBlockedIp(ip: string): boolean {
  const v4Mapped = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : null;
  if (v4Mapped && isIP(v4Mapped) === 4) return isPrivateIPv4(v4Mapped);
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  if (isIP(ip) === 6) return isPrivateIPv6(ip);
  return true;
}

export async function validateUrl(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only HTTPS URLs are allowed" };
  if (url.username || url.password) return { ok: false, reason: "Credentials in URL are not allowed" };

  const hostname = url.hostname;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    return { ok: false, reason: "Host is not publicly resolvable" };
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) return { ok: false, reason: "IP address is in a blocked range" };
    return { ok: true, url };
  }

  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) return { ok: false, reason: "Host resolves to a blocked IP range" };
  } catch {
    return { ok: false, reason: "DNS lookup failed" };
  }
  return { ok: true, url };
}

export async function safeFetchHtml(rawUrl: string): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await validateUrl(currentUrl);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    let response: Response;
    try {
      response = await fetch(validated.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en,pl;q=0.8",
        },
      });
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError" ? "Request timed out" : "Request failed";
      return { ok: false, reason: message };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "Redirect without location" };
      currentUrl = new URL(location, validated.url).toString();
      continue; // next hop is re-validated at the top of the loop
    }

    if (response.status === 403 || response.status === 429) {
      return { ok: false, reason: "The merchant blocked automated access" };
    }
    if (!response.ok) {
      return { ok: false, reason: `Merchant page returned HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ok: false, reason: "Page is not HTML" };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ok: false, reason: "Empty response body" };
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    return { ok: true, html, finalUrl: currentUrl };
  }

  return { ok: false, reason: "Too many redirects" };
}
