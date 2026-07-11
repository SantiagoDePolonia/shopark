import { ShoppingIntentSchema, type ShoppingIntent } from "../types";
import { parseIntentHeuristically } from "./heuristic";

/**
 * OpenAI-backed intent extraction. The model normalizes language into a
 * structure; Zod validates it and the heuristic parser is the fallback,
 * so the flow works with no OpenAI key at all.
 */

const INTENT_MODEL = process.env.OPENAI_INTENT_MODEL ?? "gpt-4o-mini";

export type IntentParseOutcome = {
  intent: ShoppingIntent;
  clarification?: string;
  source: "openai" | "heuristic";
};

const SYSTEM_PROMPT = `You convert a shopping request into structured JSON.
Extract only facts stated by the user; never invent attributes.
"productCategory" must stay SPECIFIC to what was asked ("football",
"basketball shoes") — never a broad bucket like "sports equipment",
"accessories", or "electronics".
Also produce:
- "searchQuery": ONLY the most shopping-critical keywords in English:
  brand, product type, model, defining attributes. Spell number words as
  digits. Drop filler, politeness, verbs, budgets, delivery words —
  those belong in their own fields, never in the keywords.
  Examples:
  - "I would like to order a bicycle" -> "bicycle"
  - "search for the bicycle under one thousand plm" -> "bicycle"
  - "iPhone sixteen pro with two five six gigs" -> "iphone 16 pro 256gb"
  - "Find me new white basketball shoes in size 43 for up to 300 PLN
    including delivery" -> "white basketball shoes"
- "localizedQuery": exactly the same keywords translated to Polish (the
  target market): "bicycle" -> "rower", "sunglasses" -> "okulary
  przeciwsloneczne", "white basketball shoes" -> "biale buty do
  koszykowki". Same rules: keywords only.
Set "clarification" to ONE short question ONLY if a missing detail could
materially change the result (size for shoes/clothing, budget currency,
whether the budget includes delivery, new vs used, storage capacity).
If nothing essential is missing, set clarification to null.
Prices: numbers only. Country defaults to PL, currency to PLN.`;

const JSON_SCHEMA = {
  name: "shopping_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string" },
      searchQuery: { type: ["string", "null"] },
      localizedQuery: { type: ["string", "null"] },
      productCategory: { type: ["string", "null"] },
      brand: { type: ["string", "null"] },
      model: { type: ["string", "null"] },
      attributes: {
        type: "object",
        additionalProperties: false,
        properties: {
          size: { type: ["string", "null"] },
          color: { type: ["string", "null"] },
          material: { type: ["string", "null"] },
          gender: { type: ["string", "null"] },
          condition: { type: ["string", "null"], enum: ["new", "used", "refurbished", null] },
          capacity: { type: ["string", "null"] },
        },
        required: ["size", "color", "material", "gender", "condition", "capacity"],
      },
      budget: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          maximum: { type: "number" },
          currency: { type: "string", enum: ["PLN", "EUR", "USD"] },
          includesShipping: { type: "boolean" },
        },
        required: ["maximum", "currency", "includesShipping"],
      },
      clarification: { type: ["string", "null"] },
    },
    required: ["query", "searchQuery", "localizedQuery", "productCategory", "brand", "model", "attributes", "budget", "clarification"],
  },
} as const;

type RawExtraction = {
  query: string;
  searchQuery: string | null;
  localizedQuery: string | null;
  productCategory: string | null;
  brand: string | null;
  model: string | null;
  attributes: Record<string, string | null>;
  budget: { maximum: number; currency: "PLN" | "EUR" | "USD"; includesShipping: boolean } | null;
  clarification: string | null;
};

export async function parseIntent(text: string, priorContext?: string): Promise<IntentParseOutcome> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { intent: parseIntentHeuristically(text), source: "heuristic" };
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(priorContext ? [{ role: "user", content: `Earlier context: ${priorContext}` }] : []),
      { role: "user", content: text },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: INTENT_MODEL,
        messages,
        response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = JSON.parse(data.choices[0].message.content) as RawExtraction;

    const attributes = Object.fromEntries(
      Object.entries(raw.attributes).filter(([, v]) => v !== null),
    ) as Record<string, string>;

    const intent = ShoppingIntentSchema.parse({
      query: raw.query || text,
      searchQuery: raw.searchQuery ?? undefined,
      localizedQuery: raw.localizedQuery ?? undefined,
      productCategory: raw.productCategory ?? undefined,
      brand: raw.brand ?? undefined,
      model: raw.model ?? undefined,
      attributes,
      budget: raw.budget ?? undefined,
      location: { country: "PL" },
    });

    // Safety net: budgets must never be lost to model nondeterminism.
    if (!intent.budget) {
      intent.budget = parseIntentHeuristically(text).budget;
    }

    return {
      intent,
      clarification: raw.clarification ?? undefined,
      source: "openai",
    };
  } catch {
    // Any OpenAI failure degrades to the deterministic parser.
    return { intent: parseIntentHeuristically(text), source: "heuristic" };
  }
}
