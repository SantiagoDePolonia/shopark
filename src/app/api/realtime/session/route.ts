import { NextResponse } from "next/server";
import { REALTIME_INSTRUCTIONS, SEARCH_TOOL_DEFINITION } from "@/lib/voice/realtime-config";

/**
 * Mints an ephemeral OpenAI Realtime client secret so the browser can
 * open a WebRTC session without ever seeing the real API key.
 */

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Voice is unavailable: OpenAI is not configured. Use text input instead." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          audio: { output: { voice: "marin" } },
          instructions: REALTIME_INSTRUCTIONS,
          tools: [SEARCH_TOOL_DEFINITION],
          tool_choice: "auto",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Realtime session mint failed", response.status, detail.slice(0, 500));
      return NextResponse.json(
        { error: "Could not start a voice session. Use text input instead." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { value?: string; client_secret?: { value: string } };
    const clientSecret = data.value ?? data.client_secret?.value;
    if (!clientSecret) {
      return NextResponse.json(
        { error: "Voice session response was malformed. Use text input instead." },
        { status: 502 },
      );
    }

    return NextResponse.json({ clientSecret, model: REALTIME_MODEL });
  } catch {
    return NextResponse.json(
      { error: "Could not reach OpenAI for a voice session. Use text input instead." },
      { status: 502 },
    );
  }
}
