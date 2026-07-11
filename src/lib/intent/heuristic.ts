import type { ShoppingIntent } from "../types";

/**
 * Deterministic fallback intent parser. Used when OpenAI is not
 * configured or fails, and as a stable baseline in tests.
 */

const COLORS = [
  "white", "black", "red", "blue", "green", "grey", "gray", "silver",
  "gold", "pink", "yellow", "orange", "purple", "brown", "beige", "navy",
];

const KNOWN_BRANDS = [
  "nike", "adidas", "puma", "reebok", "new balance", "sony", "bose", "jbl",
  "sennheiser", "samsung", "sandisk", "kingston", "apple", "xiaomi", "lenovo",
];

export function parseIntentHeuristically(text: string): ShoppingIntent {
  const lower = text.toLowerCase();

  const budgetMatch = lower.match(
    /(?:under|below|up to|max|maximum|for up to|less than|no more than)\s*(\d+(?:[.,]\d+)?)\s*(pln|zł|eur|€|usd|\$)?/i,
  );
  const currencyRaw = budgetMatch?.[2];
  const currency =
    currencyRaw === "eur" || currencyRaw === "€"
      ? "EUR"
      : currencyRaw === "usd" || currencyRaw === "$"
        ? "USD"
        : "PLN";

  const includesShipping =
    /\b(deliver|delivered|including delivery|incl\.? shipping|including shipping|with shipping|z dostawą)\b/i.test(
      lower,
    );

  const sizeMatch = lower.match(/\b(?:size|rozmiar)\s*(\d{2}(?:[.,]5)?)\b/);
  const capacityMatch = lower.match(/\b(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i);

  const condition = /\b(used|second-hand|secondhand)\b/.test(lower)
    ? ("used" as const)
    : /\brefurbished\b/.test(lower)
      ? ("refurbished" as const)
      : /\bnew\b/.test(lower)
        ? ("new" as const)
        : undefined;

  const color = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
  const brand = KNOWN_BRANDS.find((b) => lower.includes(b));

  return {
    query: text.trim(),
    brand: brand ? capitalize(brand) : undefined,
    attributes: {
      ...(sizeMatch ? { size: sizeMatch[1].replace(",", ".") } : {}),
      ...(capacityMatch ? { capacity: `${capacityMatch[1]}${capacityMatch[2].toUpperCase()}` } : {}),
      ...(color ? { color } : {}),
      ...(condition ? { condition } : {}),
    },
    budget: budgetMatch
      ? {
          maximum: Number.parseFloat(budgetMatch[1].replace(",", ".")),
          currency,
          includesShipping,
        }
      : undefined,
    location: { country: "PL" },
  };
}

function capitalize(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
