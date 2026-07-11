# ShopArk

**Tell ShopArk what you need. It compares offers across merchants, verifies the best candidates directly on their pages, and gives you one clear decision.**

ShopArk is a voice-first shopping agent. It doesn't just find a cheap listing — it checks multiple offers, re-checks price and availability on the merchant's own page, and carries one trusted choice forward. Built as a hackathon MVP with a deterministic core: the language model talks, but never decides.

---

## Product goal

Sorting Google Shopping by sticker price is a trap: the "cheapest" listing may be the wrong size, used, out of stock, stale, coupon-gated, or padded with a 40 PLN delivery fee. ShopArk's job is to protect the user from bad offers:

1. Understand a natural request (voice or text): *"Find me new white basketball shoes in size 43 for up to 300 PLN, including delivery."*
2. Ask at most one or two clarification questions that actually matter.
3. Search several providers in parallel.
4. Enforce critical requirements (size, condition, color, capacity) in deterministic code.
5. Verify the cheapest candidates on the merchant pages themselves.
6. Rank by **lowest known total price** (product + delivery − valid discounts) and present **one** recommendation, with alternatives collapsed behind a click.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

**The app runs with zero credentials** — it falls back to `demo` mode with a deterministic local catalog. To enable live features, copy `.env.example` to `.env.local` and fill in:

| Variable | Enables |
|---|---|
| `OPENAI_API_KEY` | LLM intent extraction + Realtime voice |
| `SERPAPI_API_KEY` (or `SERF_API`) | Live Google Shopping discovery via SerpAPI |
| `DATAFORSEO_API_KEY_BASE64` | Second Google Shopping source via DataForSEO Merchant API (base64 of `login:password`; account must be verified) |
| `SEARCH_MODE` | `live` \| `hybrid` (default) \| `demo` |

Never commit `.env.local`. Keys are used server-side only; the browser receives at most a short-lived Realtime client secret.

```bash
npm test             # unit + pipeline evaluation tests (vitest)
npm run build        # production build
npm start            # serve the production build
```

## The main demo

1. Open ShopArk on a phone or desktop browser.
2. Tap the microphone and say:
   *"Find me new white basketball shoes in size 43 for up to 300 PLN, including delivery."*
   (or click the example prompt and press **Search**).
3. ShopArk may ask one clarifying question, then confirms:
   *"I'm looking for new white basketball shoes in size 43, under 300.00 PLN including delivery."*
4. Watch the progress: searching → comparing → verifying the cheapest → selecting.
5. The result: **Nike Court Vision Low, 259.99 PLN total, price and availability verified**, with the reasons, and collapsed alternatives.

Why that offer wins — the seeded dataset contains every classic trap, and each is caught by a different subsystem:

| Trap | Sticker price | What ShopArk does |
|---|---|---|
| Expensive delivery | 239.00 + 39.99 | Loses on *total* price |
| Wrong size (42) | 219.00 | Rejected by critical-attribute match |
| Used item | 149.00 | Rejected (condition mismatch) |
| Sold out | 199.00 | Page verified → unavailable → rejected |
| Stale discovery price | "229.00" | Page shows 289.00 → reranked, over budget |
| Fake −46% discount | 269.99 | Old price ignored; ranked by real total |
| Coupon-gated price | 255.00 | Kept, tagged "Coupon required" |
| Unknown shipping | 254.00 | Never treated as free; penalized estimate |
| Bot-blocked page | 264.99 | Kept as "unverifiable" with a warning |
| Wrong product on page | 244.00 | Rejected as mismatched |

## Architecture

```
Browser (Next.js App Router, React 19, Tailwind 4)
│
├─ Voice: OpenAI Realtime over WebRTC (thin conversational layer)
│    └─ POST /api/realtime/session  → mints ephemeral client secret
├─ POST /api/intent/parse  → OpenAI structured extraction (Zod-validated,
│                             deterministic heuristic parser as fallback)
├─ POST /api/search        → the deterministic pipeline:
│    1. providers run in parallel w/ independent timeouts (src/lib/providers)
│    2. matching: critical attributes enforced in code (src/lib/matching.ts)
│    3. ranking: lowest known total price (src/lib/ranking.ts)
│    4. verification: top-3 cheapest checked on merchant pages, in rounds,
│       reranking after every price change (src/lib/verification)
│    5. tags derived from evidence only (src/lib/tags.ts)
└─ GET /api/searches/{id}  → in-memory result store
```

**The LLM never chooses the winner.** It extracts intent and reads the deterministic summary aloud. Ranking, price arithmetic (integer minor units — `src/lib/money.ts`), verification verdicts, and tags are pure, tested TypeScript.

### Voice flow

The Realtime agent is configured (`src/lib/voice/realtime-config.ts`) to gather requirements, ask at most two clarifying questions, confirm, then call the `search_products` tool. The browser hook (`src/lib/voice/useRealtimeVoice.ts`) runs the search through the same `/api/search` pipeline as text and returns only the deterministic summary for the agent to read aloud. Hard rules in the system prompt forbid price arithmetic, ranking, invented facts, and absolute claims. If the mic is denied or Realtime fails, the transcript (when available) is preserved into the text input and the whole flow continues by text.

### Providers

`ShoppingProvider` is a small interface (`src/lib/types.ts`); providers run in parallel and one failure never kills the search.

- **`demo`** — deterministic local catalog (basketball shoes, headphones, SSD scenarios + a seeded generic fallback for any query). Always available, works offline.
- **`google_shopping`** — SerpAPI. Discovery only; results are candidates, never truth. Google links can't be verified as merchant pages, so most live offers surface as "unverifiable" unless a direct merchant URL is present.
- **`google_shopping_dataforseo`** — DataForSEO Merchant API as a second Google Shopping source. It often returns direct merchant URLs, which makes its offers verifiable on the merchant page. Both live providers run in parallel; the product-identity grouping merges duplicates of the same product.
- Allegro / eBay — adapter slots exist by design (`discoverySource` union); not implemented in this MVP.

Modes: `live` (external only), `hybrid` (external + demo, default), `demo` (local only). Live modes silently degrade to demo when keys are missing. The header shows which data the current result used.

### Product matching

Evidence order: GTIN → SKU → brand+model → normalized title. Critical attributes (size, capacity, color, condition, gender) are enforced by code — high title similarity can never override a conflicting size. When a size is requested but the offer shows no size evidence at all, the offer is dropped from contention ("must match explicitly"). Titles are also mined for embedded sizes (`… / 42 /`).

### Verification

Sequence per candidate: SSRF-hardened HTTPS fetch → schema.org JSON-LD → Open Graph/metadata → visible page text. Statuses:

- `verified` — same product, price and availability confirmed
- `changed` — page inspected, price differs → observed price adopted, totals recomputed, everything reranked (up to 3 rounds)
- `unverifiable` — blocked/timeout/unreadable → may still win if genuinely cheapest, always with a prominent warning and "Check on merchant website" instead of "View offer"
- `unavailable` / `mismatched` — can never win

The fetcher (`src/lib/verification/safe-fetch.ts`) enforces: HTTPS only, DNS + IP validation (private/link-local/CGNAT/metadata ranges blocked, IPv6 included), per-hop redirect re-validation, 4-redirect cap, 8 s timeout, 2 MB response cap, HTML content type, honest user agent. No CAPTCHA bypassing, ever. Playwright was scoped out of the MVP (see limitations).

### Error handling / graceful fallback

| Failure | Behavior |
|---|---|
| Mic denied / Realtime down | Notice + text input; transcript preserved into the input |
| OpenAI missing/down | Deterministic heuristic intent parser |
| A provider fails/times out | Other providers continue; subtle notice on result |
| Verification fails | Offer kept as `unverifiable` + warning |
| Nothing within budget | Budget never silently broken — shows closest valid match above budget |
| No credentials at all | Full demo mode |

### Language discipline

The UI says "Best verified matching offer", "lowest price among the offers we checked", "estimated total". It never claims "cheapest on the internet" or "guaranteed". Unverified winners get "Check on merchant website", and ShopArk never redirects automatically.

## Testing

```bash
npm test
```

58 tests cover: money arithmetic and price parsing (Polish formats, currency traps), intent validation and the heuristic parser, attribute normalization, critical-attribute rejection, product identity grouping, total-price calculation (missing shipping ≠ zero), deterministic ranking (all trap cases), changed-price reranking, budget enforcement, tag derivation, SSRF validation, JSON-LD/metadata/page-text extraction, and an end-to-end evaluation of the demo scenarios measuring **strike precision** (the winner is the honest 259.99 verified offer) and **false-buy safety** (no trap ever appears as a safe recommendation).

## Deployment

Standard Next.js — Vercel-compatible:

```bash
vercel deploy    # set OPENAI_API_KEY, SERPAPI_API_KEY, SEARCH_MODE in project env
```

Notes: the search store is in-memory (per-instance; fine for a demo — swap `src/lib/search/store.ts` for SQLite/Supabase for persistence). Verification runs in the Node.js runtime (uses `node:dns`).

## Known limitations

- Live Google Shopping links point at Google, not merchants, so live offers are mostly "unverifiable" — the honest status is shown. Direct-merchant URL resolution (SerpAPI immersive product API) is the clear next step.
- No Playwright fallback yet; JS-only merchant pages are unverifiable.
- Currency conversion is not performed; offers in a different currency than the budget are excluded rather than converted.
- In-memory store; results don't survive a server restart.
- The voice agent needs a Realtime-enabled OpenAI key; otherwise text flow only.

## Later phases (designed for, not built)

- **Price alerts** — saved searches with target prices, re-run on a schedule, verified before notifying (PWA push/email).
- **Goal-based baskets** — "I want to play basketball tomorrow" → proposed category list → budget allocation → one verified offer per category, separate merchant links (no cross-merchant checkout).
- **rePebble Time 2** — the watch reuses the same APIs: request via phone, progress on wrist, result as short summary + QR code opening the full ShopArk result. All ranking/search stays server-side.

## Security considerations

- API keys server-side only; browser gets a short-lived Realtime secret.
- SSRF protections listed above; no bot-protection circumvention.
- Zod validation on every API boundary.
- No purchase execution — ShopArk always hands the user to the merchant.
