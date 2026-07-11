"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlternativesList } from "@/components/AlternativesList";
import { Wordmark } from "@/components/Logo";
import { MicButton, type MicState } from "@/components/MicButton";
import { WinnerCard } from "@/components/OfferCard";
import { SearchProgress } from "@/components/SearchProgress";
import { VerificationBadge } from "@/components/VerificationBadge";
import { formatMoney } from "@/lib/money";
import { computeTotal } from "@/lib/pricing";
import type { SearchResult, ShoppingIntent } from "@/lib/types";
import { useRealtimeVoice } from "@/lib/voice/useRealtimeVoice";

const EXAMPLE_PROMPTS = [
  "Find me new white basketball shoes in size 43 under 300 PLN delivered.",
  "Find noise-cancelling headphones under 600 PLN.",
  "Find a 1 TB portable SSD with USB-C under 400 PLN.",
];

const SEARCH_STEPS = [
  "Understanding your request…",
  "Searching across merchants…",
  "Comparing offers against your requirements…",
  "Verifying the cheapest candidates…",
  "Selecting the best match…",
];

type Stage =
  | { kind: "home" }
  | { kind: "clarifying"; question: string; originalText: string }
  | { kind: "confirming"; intent: ShoppingIntent; confirmation: string }
  | { kind: "searching" }
  | { kind: "result"; result: SearchResult }
  | { kind: "error"; message: string };

type TranscriptLine = { role: "you" | "shopark"; text: string };

export default function Home() {
  const [stage, setStage] = useState<Stage>({ kind: "home" });
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgressTicker = useCallback(() => {
    setProgressMessages([SEARCH_STEPS[0]]);
    let i = 1;
    progressTimer.current = setInterval(() => {
      if (i < SEARCH_STEPS.length) {
        setProgressMessages(SEARCH_STEPS.slice(0, i + 1));
        i++;
      }
    }, 900);
  }, []);

  const stopProgressTicker = useCallback(() => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = null;
  }, []);

  useEffect(() => () => stopProgressTicker(), [stopProgressTicker]);

  const runSearch = useCallback(
    async (intent: ShoppingIntent): Promise<SearchResult | null> => {
      setStage({ kind: "searching" });
      startProgressTicker();
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intent }),
        });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const result = (await response.json()) as SearchResult;
        stopProgressTicker();
        setStage({ kind: "result", result });
        return result;
      } catch {
        stopProgressTicker();
        setStage({ kind: "error", message: "The search failed unexpectedly. Please try again." });
        return null;
      }
    },
    [startProgressTicker, stopProgressTicker],
  );

  const parseAndProceed = useCallback(async (requestText: string, priorContext?: string) => {
    setNotice(null);
    setStage({ kind: "searching" });
    setProgressMessages(["Understanding your request…"]);
    try {
      const response = await fetch("/api/intent/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: requestText, priorContext }),
      });
      if (!response.ok) throw new Error("parse failed");
      const data = (await response.json()) as {
        intent: ShoppingIntent;
        clarification: string | null;
        confirmation: string;
      };
      if (data.clarification && !priorContext) {
        setStage({ kind: "clarifying", question: data.clarification, originalText: requestText });
      } else {
        setStage({ kind: "confirming", intent: data.intent, confirmation: data.confirmation });
      }
    } catch {
      setStage({ kind: "error", message: "Could not understand the request. Please try again." });
    }
  }, []);

  /* ---------------- voice ---------------- */

  const voice = useRealtimeVoice({
    onSearch: async (intent) => {
      const result = await runSearch(intent);
      return {
        summary: result?.summary ?? "The search failed. Suggest typing the request instead.",
        hasWinner: Boolean(result?.winner),
      };
    },
    onUserTranscript: (line) => setTranscript((t) => [...t, { role: "you", text: line }]),
    onAssistantTranscript: (line) => setTranscript((t) => [...t, { role: "shopark", text: line }]),
    onError: (message, savedTranscript) => {
      setNotice(message);
      if (savedTranscript) setText(savedTranscript);
    },
  });

  const micState: MicState =
    voice.state === "connecting"
      ? "connecting"
      : voice.state === "listening"
        ? "listening"
        : voice.state === "speaking"
          ? "speaking"
          : "idle";

  const handleMic = () => {
    if (voice.state === "listening" || voice.state === "speaking") {
      voice.stop();
    } else {
      setTranscript([]);
      setNotice(null);
      void voice.start();
    }
  };

  const restart = () => {
    voice.stop();
    stopProgressTicker();
    setStage({ kind: "home" });
    setText("");
    setTranscript([]);
    setNotice(null);
  };

  /* ---------------- render ---------------- */

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-foam-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-3.5">
          <button
            type="button"
            onClick={restart}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-900"
          >
            <Wordmark />
          </button>
          {stage.kind === "result" && (
            <span className="rounded-full bg-foam-100 px-3 py-1 text-xs text-ink-600">
              {stage.result.mode === "demo"
                ? "demo data"
                : stage.result.mode === "hybrid"
                  ? "live + demo data"
                  : "live data"}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-16">
        {stage.kind === "home" && (
          <div className="rise-in flex flex-col items-center pt-10 text-center sm:pt-16">
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-ink-900 sm:text-5xl">
              What are you looking
              <br />
              for today?
            </h1>
            <p className="mt-4 max-w-md text-base text-ink-600">
              Tell ShopArk what you need. We&apos;ll compare offers and verify the best one.
            </p>

            <div className="mt-10">
              <MicButton state={micState} onClick={handleMic} />
              <p className="mt-3 text-sm text-ink-400">
                {micState === "listening"
                  ? "Listening… speak naturally"
                  : micState === "speaking"
                    ? "ShopArk is speaking…"
                    : micState === "connecting"
                      ? "Connecting…"
                      : "Tap to speak"}
              </p>
            </div>

            {transcript.length > 0 && (
              <div className="mt-6 w-full max-w-md space-y-2 text-left">
                {transcript.slice(-4).map((line, i) => (
                  <p key={i} className="text-sm">
                    <span
                      className={`font-semibold ${line.role === "you" ? "text-ink-900" : "text-ocean-600"}`}
                    >
                      {line.role === "you" ? "You" : "ShopArk"}:
                    </span>{" "}
                    <span className="text-ink-600">{line.text}</span>
                  </p>
                ))}
              </div>
            )}

            {notice && (
              <p className="mt-6 w-full max-w-md rounded-xl bg-caution-100 px-4 py-3 text-sm text-caution-700">
                {notice}
              </p>
            )}

            <form
              className="mt-10 flex w-full max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) void parseAndProceed(text.trim());
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="…or type what you need"
                aria-label="Describe what you are shopping for"
                className="min-w-0 flex-1 rounded-control border border-foam-200 bg-white px-4 py-3 text-[15px] text-ink-900 placeholder:text-ink-400 focus:border-ocean-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="rounded-control bg-ocean-900 px-5 py-3 font-medium text-white transition-colors hover:bg-ocean-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600"
              >
                Search
              </button>
            </form>

            <div className="mt-6 flex w-full max-w-md flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setText(prompt)}
                  className="rounded-full border border-foam-200 bg-white px-4 py-2 text-left text-xs text-ink-600 transition-colors hover:border-ocean-300 hover:text-ink-900"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <p className="mt-10 max-w-sm text-xs text-ink-400">
              Voice is processed to understand your request and never stored. If the microphone is
              unavailable, everything works by text too.
            </p>
          </div>
        )}

        {stage.kind === "clarifying" && (
          <div className="rise-in mx-auto max-w-md pt-14">
            <p className="font-display text-2xl font-bold text-ink-900">One quick question</p>
            <p className="mt-3 text-lg text-ink-600">{stage.question}</p>
            <ClarificationForm
              onAnswer={(answer) =>
                void parseAndProceed(
                  `${stage.originalText}\nAdditional detail: ${answer}`,
                  stage.originalText,
                )
              }
            />
          </div>
        )}

        {stage.kind === "confirming" && (
          <div className="rise-in mx-auto max-w-md pt-14 text-center">
            <p className="font-display text-2xl font-bold text-ink-900">Did I get this right?</p>
            <p className="mt-4 rounded-card bg-white px-5 py-4 text-[15px] text-ink-600 shadow-card">
              {stage.confirmation}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void runSearch(stage.intent)}
                className="flex-1 rounded-control bg-coral-500 px-6 py-3.5 font-display font-semibold text-white transition-colors hover:bg-coral-600"
              >
                Yes, search
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(stage.intent.query);
                  setStage({ kind: "home" });
                }}
                className="rounded-control border border-foam-200 bg-white px-6 py-3.5 font-medium text-ink-600 transition-colors hover:bg-foam-100"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        {stage.kind === "searching" && <SearchProgress messages={progressMessages} />}

        {stage.kind === "result" && <ResultView result={stage.result} onRestart={restart} />}

        {stage.kind === "error" && (
          <div className="rise-in mx-auto max-w-md pt-16 text-center">
            <p className="font-display text-2xl font-bold text-ink-900">Something went wrong</p>
            <p className="mt-3 text-ink-600">{stage.message}</p>
            <button
              type="button"
              onClick={restart}
              className="mt-6 rounded-control bg-ocean-900 px-6 py-3 font-medium text-white hover:bg-ocean-800"
            >
              Start over
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function ClarificationForm({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <form
      className="mt-6 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (answer.trim()) onAnswer(answer.trim());
      }}
    >
      <input
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        aria-label="Your answer"
        className="min-w-0 flex-1 rounded-control border border-foam-200 bg-white px-4 py-3 text-[15px] focus:border-ocean-600 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!answer.trim()}
        className="rounded-control bg-ocean-900 px-5 py-3 font-medium text-white hover:bg-ocean-800 disabled:opacity-40"
      >
        Continue
      </button>
    </form>
  );
}

function ResultView({ result, onRestart }: { result: SearchResult; onRestart: () => void }) {
  const winner = result.winner;

  if (!winner) {
    const closest = result.closestAboveBudget;
    return (
      <div className="rise-in mx-auto max-w-md pt-14 text-center">
        <p className="font-display text-2xl font-bold text-ink-900">No matching offer</p>
        <p className="mt-3 text-ink-600">{result.summary}</p>
        {closest && (
          <div className="mt-6 rounded-card bg-white p-5 text-left shadow-card">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-400">
              Closest valid match
            </p>
            <p className="mt-2 font-medium text-ink-900">{closest.product.title}</p>
            <p className="text-sm text-ink-600">{closest.merchant.name}</p>
            <div className="mt-2 flex items-center justify-between">
              <VerificationBadge status={closest.verification.status} compact />
              <p className="tnum font-display text-xl font-bold">
                {(() => {
                  const total = computeTotal(closest);
                  return total !== undefined
                    ? formatMoney(total, closest.pricing.currency)
                    : `${formatMoney(closest.pricing.discoveredPrice, closest.pricing.currency)} + delivery`;
                })()}
              </p>
            </div>
            <a
              href={closest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block rounded-control border border-foam-200 py-2.5 text-center text-sm font-medium text-ink-600 hover:bg-foam-100"
            >
              Check on merchant website
            </a>
          </div>
        )}
        <button
          type="button"
          onClick={onRestart}
          className="mt-8 rounded-control bg-ocean-900 px-6 py-3 font-medium text-white hover:bg-ocean-800"
        >
          New search
        </button>
      </div>
    );
  }

  const winnerTotal = computeTotal(winner);
  const runnerUp = result.sameProductAlternatives[0];
  const runnerUpTotal = runnerUp ? computeTotal(runnerUp) : undefined;

  return (
    <div className="pt-8">
      <WinnerCard offer={winner} runnerUpTotal={runnerUpTotal} onRestart={onRestart} />
      <AlternativesList
        sameProduct={result.sameProductAlternatives}
        similar={result.similarAlternatives}
        winnerTotal={winnerTotal}
      />
      {result.providerErrors.length > 0 && (
        <p className="mt-6 text-center text-xs text-ink-400">
          Some sources were unavailable; results come from the remaining providers.
        </p>
      )}
    </div>
  );
}
