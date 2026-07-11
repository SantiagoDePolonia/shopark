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

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11",
  twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20",
};

/** "iphone sixteen pro" → "iphone 16 pro"; strips filler and punctuation. */
export function normalizeSearchQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(find me|find|please|looking for|i want|i need|show me)\b/g, " ")
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[.,!?;:]+$/g, "");
      return NUMBER_WORDS[bare] ?? bare;
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** "one thousand" → "1000", "five hundred" → "500" for budget parsing. */
export function normalizeNumbers(text: string): string {
  let out = normalizeSearchQuery(text);
  out = out.replace(/\b(\d+)\s+thousand\b/g, (_, n) => String(Number(n) * 1000));
  out = out.replace(/\b(\d+)\s+hundred\b/g, (_, n) => String(Number(n) * 100));
  out = out.replace(/\bthousand\b/g, "1000").replace(/\bhundred\b/g, "100");
  return out;
}

export function parseIntentHeuristically(text: string): ShoppingIntent {
  const lower = normalizeNumbers(text.toLowerCase());

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
    searchQuery: normalizeSearchQuery(text),
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
