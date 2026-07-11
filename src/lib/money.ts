/**
 * Decimal-safe money arithmetic.
 *
 * Prices are exposed to the rest of the app as major-unit numbers
 * (e.g. 249.99 PLN) to match provider payloads, but every calculation
 * routes through integer minor units (grosze/cents) so floating point
 * error can never change a comparison or a total.
 */

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Sum major-unit amounts without floating point drift. */
export function addMoney(...amounts: number[]): number {
  return fromMinor(amounts.reduce((acc, a) => acc + toMinor(a), 0));
}

export function subtractMoney(a: number, b: number): number {
  return fromMinor(toMinor(a) - toMinor(b));
}

/** Compare two major-unit amounts exactly. Negative if a < b. */
export function compareMoney(a: number, b: number): number {
  return toMinor(a) - toMinor(b);
}

/** True when the two amounts differ by at most `toleranceMinor` grosze. */
export function moneyEquals(a: number, b: number, toleranceMinor = 0): boolean {
  return Math.abs(toMinor(a) - toMinor(b)) <= toleranceMinor;
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * Parse a price string like "1 249,99 zł", "249.00 PLN", "$59.99".
 * Returns null when no plausible amount is present.
 */
export function parsePrice(raw: string): { amount: number; currency?: string } | null {
  if (!raw) return null;
  const currency = detectCurrency(raw);
  // Strip everything except digits and separators.
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the later one is the decimal separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    // "1,234" is a thousands separator; "249,99" is a decimal comma.
    normalized =
      decimals === 3 && cleaned.length > 4
        ? cleaned.replace(/,/g, "")
        : cleaned.replace(",", ".");
  }

  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount: fromMinor(toMinor(amount)), currency };
}

function detectCurrency(raw: string): string | undefined {
  const upper = raw.toUpperCase();
  if (upper.includes("PLN") || raw.includes("zł") || raw.includes("ZŁ")) return "PLN";
  if (upper.includes("EUR") || raw.includes("€")) return "EUR";
  if (upper.includes("USD") || raw.includes("$")) return "USD";
  if (upper.includes("GBP") || raw.includes("£")) return "GBP";
  return undefined;
}
