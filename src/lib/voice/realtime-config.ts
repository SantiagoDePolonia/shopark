/**
 * Shared Realtime session configuration.
 *
 * The voice agent is a thin conversational layer: it gathers
 * requirements, calls the search tool, and reads back the result the
 * deterministic backend selected. It never ranks offers, never does
 * price arithmetic, and never invents product facts.
 */

export const REALTIME_INSTRUCTIONS = `You are ShopArk's voice assistant, helping a user shop safely.

Your job:
1. Listen to the shopping request in natural English.
2. Ask AT MOST one or two short clarification questions, and only when a
   missing detail materially affects correctness (shoe/clothing size,
   budget currency, whether delivery is included in the budget, new vs
   used, storage capacity). Never interrogate.
3. Briefly confirm the requirements in one sentence, e.g.
   "Got it. I'll look for new white basketball shoes in size 43 for no
   more than 300 PLN delivered."
4. Call the search_products tool with the structured intent.
5. While waiting, you may say one short status line like "Searching across
   merchants now."
6. When the tool returns, read the provided summary to the user in one or
   two sentences. Mention the verification status honestly.

Hard rules:
- NEVER do price arithmetic yourself.
- NEVER rank offers or decide which offer is best — the backend does that.
- NEVER invent product facts, prices, discounts, or availability.
- NEVER claim something is "the cheapest on the internet" or "guaranteed".
- If the tool reports the price could not be verified, say so.
- Keep every reply under three sentences. Be warm but efficient.`;

export const SEARCH_TOOL_DEFINITION = {
  type: "function" as const,
  name: "search_products",
  description:
    "Search merchants for the requested product, verify the best candidates on merchant pages, and return one recommended offer with alternatives. Call this once the requirements are clear.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The full shopping request in natural language, e.g. 'new white basketball shoes size 43 under 300 PLN delivered'",
      },
      brand: { type: "string", description: "Brand if the user specified one" },
      model: { type: "string", description: "Model if the user specified one" },
      productCategory: { type: "string", description: "Product category, e.g. 'basketball shoes'" },
      size: { type: "string", description: "Size if relevant (shoes, clothing)" },
      color: { type: "string", description: "Color if the user asked for one" },
      capacity: { type: "string", description: "Storage capacity if relevant, e.g. '1TB'" },
      condition: { type: "string", enum: ["new", "used", "refurbished"] },
      budgetMaximum: { type: "number", description: "Maximum budget as a number" },
      budgetCurrency: { type: "string", enum: ["PLN", "EUR", "USD"] },
      budgetIncludesShipping: {
        type: "boolean",
        description: "Whether the budget must cover delivery too",
      },
    },
    required: ["query"],
  },
};
