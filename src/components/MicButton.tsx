"use client";

export type MicState = "idle" | "connecting" | "listening" | "speaking" | "unavailable";

export function MicButton({
  state,
  onClick,
}: {
  state: MicState;
  onClick: () => void;
}) {
  const active = state === "listening" || state === "speaking";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "unavailable" || state === "connecting"}
      aria-label={active ? "Stop voice conversation" : "Start voice conversation"}
      className="group relative flex h-24 w-24 items-center justify-center rounded-full bg-coral-500 text-white shadow-hero transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral-600"
    >
      {active && (
        <>
          <span className="listening-ripple absolute inset-0 rounded-full bg-coral-400" />
          <span
            className="listening-ripple absolute inset-0 rounded-full bg-coral-400"
            style={{ animationDelay: "0.55s" }}
          />
        </>
      )}
      <span className="relative">
        {state === "connecting" ? (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : active ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        ) : (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z" />
            <path d="M6 11.5a6 6 0 0 0 12 0h-1.8a4.2 4.2 0 0 1-8.4 0H6Z" />
            <path d="M11.1 17h1.8v3.5h-1.8z" />
            <path d="M8.5 20.5h7V22h-7z" />
          </svg>
        )}
      </span>
    </button>
  );
}
