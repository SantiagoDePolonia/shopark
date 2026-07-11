import { NextResponse } from "next/server";
import { z } from "zod";
import { buildConfirmation } from "@/lib/intent/confirmation";
import { parseIntent } from "@/lib/intent/openai";

const BodySchema = z.object({
  text: z.string().min(1).max(2000),
  priorContext: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Provide { text: string }" }, { status: 400 });
  }

  const outcome = await parseIntent(body.data.text, body.data.priorContext);
  return NextResponse.json({
    intent: outcome.intent,
    clarification: outcome.clarification ?? null,
    confirmation: buildConfirmation(outcome.intent),
    source: outcome.source,
  });
}
