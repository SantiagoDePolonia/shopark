import { NextResponse } from "next/server";
import { z } from "zod";
import { parseIntent } from "@/lib/intent/openai";
import { formatMoney } from "@/lib/money";
import { computeTotal } from "@/lib/pricing";
import { executeSearch } from "@/lib/search/orchestrator";

/**
 * Watch-facing search: one call from dictated text to a compact,
 * AppMessage-sized result. The heavy lifting is the same deterministic
 * pipeline the web app uses.
 */

const BodySchema = z.object({
  text: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Provide { text: string }" }, { status: 400 });
  }

  try {
    const { intent } = await parseIntent(body.data.text);
    const result = await executeSearch(intent);
    const winner = result.winner;

    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const host = request.headers.get("host") ?? "localhost:3000";
    const resultUrl = `${proto}://${host}/r/${result.searchId}`;

    if (!winner) {
      return NextResponse.json({
        found: false,
        title: "",
        price: "",
        merchant: "",
        verified: 0,
        resultUrl,
        spoken: result.summary,
      });
    }

    const total = computeTotal(winner);
    const isVerified =
      winner.verification.status === "verified" || winner.verification.status === "changed";
    const price =
      total !== undefined
        ? formatMoney(total, winner.pricing.currency)
        : `${formatMoney(winner.pricing.discoveredPrice, winner.pricing.currency)}+ship`;

    return NextResponse.json({
      found: true,
      // Keep strings watch-friendly: short, plain ASCII where possible.
      title: winner.product.title.slice(0, 48),
      price,
      merchant: winner.merchant.name.slice(0, 24),
      verified: isVerified ? 1 : 0,
      resultUrl,
      spoken: result.summary,
    });
  } catch (error) {
    console.error("Pebble search failed", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
