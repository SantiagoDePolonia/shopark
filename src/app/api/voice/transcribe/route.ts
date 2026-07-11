import { NextResponse } from "next/server";

/**
 * Staged voice mode, step 1: audio blob → Whisper transcription.
 * Simpler and more debuggable than the Realtime WebRTC session.
 */

export const maxDuration = 30;

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Voice is unavailable: OpenAI is not configured." }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Provide an 'audio' file field." }, { status: 400 });
  }
  if (audio.size > 10_000_000) {
    return NextResponse.json({ error: "Recording is too large." }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "speech.webm");
  upstream.append("model", TRANSCRIBE_MODEL);
  upstream.append("language", "en");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Transcription failed", response.status, detail.slice(0, 300));
      return NextResponse.json({ error: "Could not transcribe the recording." }, { status: 502 });
    }
    const data = (await response.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch {
    return NextResponse.json({ error: "Transcription timed out." }, { status: 504 });
  }
}
