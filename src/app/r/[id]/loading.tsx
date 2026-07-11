import { Wordmark } from "@/components/Logo";

/** Streams immediately while the server re-runs the search if needed. */
export default function LoadingResult() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-5">
      <header className="py-4">
        <Wordmark />
      </header>
      <div className="flex flex-col items-center pt-20 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-foam-200 border-t-ink-900" />
        <p className="mt-6 font-display text-lg font-semibold text-ink-900">
          Retrieving your result…
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Re-checking offers and prices. This can take a few seconds.
        </p>
      </div>
    </div>
  );
}
