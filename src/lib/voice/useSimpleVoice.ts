"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Staged voice: tap to record, tap to stop → Whisper transcript feeds
 * the normal text flow; spoken replies come from the TTS endpoint.
 * No WebRTC, no persistent session — every step is a plain request.
 */

export type SimpleVoiceState = "idle" | "recording" | "transcribing";

export function useSimpleVoice({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<SimpleVoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access was denied. You can type your request instead.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    streamRef.current = stream;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      cleanupStream();
      if (blob.size < 1000) {
        setState("idle");
        return; // too short to be speech
      }
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob);
        const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok || !data.text) {
          onError(data.error ?? "Could not understand the recording. Try again or type instead.");
        } else {
          onTranscript(data.text);
        }
      } catch {
        onError("Transcription failed. Try again or type instead.");
      } finally {
        setState("idle");
      }
    };

    recorder.start();
    setState("recording");
  }, [cleanupStream, onError, onTranscript]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop handles the rest
    } else {
      cleanupStream();
      setState("idle");
    }
  }, [cleanupStream]);

  /** Read a deterministic backend sentence aloud. Failures stay silent. */
  const speak = useCallback(async (text: string) => {
    try {
      audioRef.current?.pause();
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(audio.src);
      await audio.play().catch(() => {});
    } catch {
      /* voice output is best-effort */
    }
  }, []);

  return { state, start, stop, speak };
}
