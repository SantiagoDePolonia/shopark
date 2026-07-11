"use client";

import { useCallback, useRef, useState } from "react";
import type { ShoppingIntent } from "../types";

/**
 * OpenAI Realtime over WebRTC.
 *
 * The hook keeps the voice agent a thin layer: when the model calls
 * search_products, the structured intent is handed to the app, the
 * deterministic backend picks the winner, and only its summary is sent
 * back for the model to read aloud.
 */

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";

export type VoiceSearchHandler = (intent: ShoppingIntent) => Promise<{
  summary: string;
  hasWinner: boolean;
}>;

type ToolArgs = {
  query: string;
  brand?: string;
  model?: string;
  productCategory?: string;
  size?: string;
  color?: string;
  capacity?: string;
  condition?: "new" | "used" | "refurbished";
  budgetMaximum?: number;
  budgetCurrency?: "PLN" | "EUR" | "USD";
  budgetIncludesShipping?: boolean;
};

export function intentFromToolArgs(args: ToolArgs): ShoppingIntent {
  return {
    query: args.query,
    brand: args.brand,
    model: args.model,
    productCategory: args.productCategory,
    attributes: {
      ...(args.size ? { size: args.size } : {}),
      ...(args.color ? { color: args.color } : {}),
      ...(args.capacity ? { capacity: args.capacity } : {}),
      ...(args.condition ? { condition: args.condition } : {}),
    },
    budget:
      args.budgetMaximum !== undefined
        ? {
            maximum: args.budgetMaximum,
            currency: args.budgetCurrency ?? "PLN",
            includesShipping: args.budgetIncludesShipping ?? true,
          }
        : undefined,
    location: { country: "PL" },
  };
}

export function useRealtimeVoice({
  onSearch,
  onUserTranscript,
  onAssistantTranscript,
  onError,
}: {
  onSearch: VoiceSearchHandler;
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
  onError: (message: string, transcript?: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<string>("");

  const stop = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  const fail = useCallback(
    (message: string) => {
      onError(message, transcriptRef.current || undefined);
      stop();
      setState("error");
    },
    [onError, stop],
  );

  const runToolCall = useCallback(
    async (callId: string, rawArgs: string) => {
      let output: { summary: string; hasWinner: boolean };
      try {
        const args = JSON.parse(rawArgs) as ToolArgs;
        output = await onSearch(intentFromToolArgs(args));
      } catch {
        output = {
          summary: "The search failed unexpectedly. Apologize briefly and suggest trying again.",
          hasWinner: false,
        };
      }
      const channel = channelRef.current;
      if (!channel || channel.readyState !== "open") return;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
        }),
      );
      channel.send(JSON.stringify({ type: "response.create" }));
    },
    [onSearch],
  );

  const handleEvent = useCallback(
    async (event: Record<string, unknown>) => {
      const type = event.type as string;

      if (type === "conversation.item.input_audio_transcription.completed") {
        const text = (event.transcript as string) ?? "";
        if (text.trim()) {
          transcriptRef.current = text;
          onUserTranscript(text.trim());
        }
        return;
      }

      if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
        const text = (event.transcript as string) ?? "";
        if (text.trim()) onAssistantTranscript(text.trim());
        return;
      }

      if (type === "output_audio_buffer.started") {
        setState("speaking");
        return;
      }
      if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
        setState((s) => (s === "speaking" ? "listening" : s));
        return;
      }

      if (type === "response.done") {
        const response = event.response as { output?: Array<Record<string, unknown>> } | undefined;
        for (const item of response?.output ?? []) {
          if (item.type === "function_call" && item.name === "search_products") {
            await runToolCall(item.call_id as string, item.arguments as string);
          }
        }
        return;
      }

      if (type === "error") {
        const err = event.error as { message?: string } | undefined;
        console.error("Realtime error", err);
      }
    },
    [onUserTranscript, onAssistantTranscript, runToolCall],
  );

  const start = useCallback(async () => {
    if (peerRef.current) return;
    setState("connecting");
    transcriptRef.current = "";

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("Microphone access was denied. You can type your request instead.");
      return;
    }

    let clientSecret: string;
    let model: string;
    try {
      const response = await fetch("/api/realtime/session", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.clientSecret) {
        stream.getTracks().forEach((t) => t.stop());
        fail(data.error ?? "Voice is unavailable right now. You can type your request instead.");
        return;
      }
      clientSecret = data.clientSecret;
      model = data.model;
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      fail("Voice is unavailable right now. You can type your request instead.");
      return;
    }

    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      streamRef.current = stream;

      peer.ontrack = (event) => {
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = event.streams[0];
        audioRef.current = audio;
      };

      for (const track of stream.getTracks()) peer.addTrack(track, stream);

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          void handleEvent(JSON.parse(message.data));
        } catch {
          /* ignore malformed events */
        }
      };
      channel.onopen = () => {
        setState("listening");
        // Ask for user-speech transcription so we can preserve transcripts.
        channel.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              audio: { input: { transcription: { model: "whisper-1" } } },
            },
          }),
        );
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${clientSecret}`, "content-type": "application/sdp" },
          body: offer.sdp,
        },
      );
      if (!sdpResponse.ok) throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
      const answer = await sdpResponse.text();
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      console.error("Realtime connection failed", error);
      fail("Could not start the voice session. You can type your request instead.");
    }
  }, [fail, handleEvent]);

  return { state, start, stop };
}
