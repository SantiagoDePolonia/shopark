import { NextResponse } from "next/server";

export const maxDuration = 60;
import { z } from "zod";
import { executeSearch } from "@/lib/search/orchestrator";
import { ShoppingIntentSchema } from "@/lib/types";

const BodySchema = z.object({
  intent: ShoppingIntentSchema,
  mode: z.enum(["live", "hybrid", "demo"]).optional(),
});

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Provide { intent: ShoppingIntent }", details: body.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await executeSearch(body.data.intent, { mode: body.data.mode });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Search failed", error);
    return NextResponse.json({ error: "Search failed unexpectedly" }, { status: 500 });
  }
}
