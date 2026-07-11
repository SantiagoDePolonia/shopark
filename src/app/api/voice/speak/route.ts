import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Staged voice mode, step 2: text → spoken audio (OpenAI TTS).
 * The text is always deterministic backend output, never model prose.
 */

export const maxDuration = 30;

const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "tts-1";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE ?? "nova";

const BodySchema = z.object({ text: z.string().min(1).max(600) });

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "OpenAI is not configured." }, { status: 503 });
  }

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Provide { text: string }" }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: body.data.text,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "Speech synthesis failed." }, { status: 502 });
    }
    return new Response(response.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Speech synthesis timed out." }, { status: 504 });
  }
}
