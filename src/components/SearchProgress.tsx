/**
 * The signature searching animation: a coral dot rides the wave while
 * progress messages narrate discover → compare → verify → select.
 */
export function SearchProgress({ messages }: { messages: string[] }) {
  const current = messages[messages.length - 1] ?? "Understanding your request…";

  return (
    <div className="rise-in flex flex-col items-center gap-6 py-10">
      <div className="relative h-16 w-64 overflow-hidden" aria-hidden="true">
        <svg viewBox="0 0 288 64" className="wave-shift absolute left-0 top-0 h-16 w-[360px]">
          <path
            d="M0 36 Q18 24 36 36 T72 36 T108 36 T144 36 T180 36 T216 36 T252 36 T288 36"
            fill="none"
            stroke="#d2d2d7"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute left-1/2 top-[22px] h-4 w-4 -translate-x-1/2 rounded-full bg-coral-500 shadow-card" />
      </div>

      <div aria-live="polite" className="text-center">
        <p className="font-display text-lg font-semibold text-ink-900">{current}</p>
        <ul className="mt-3 space-y-1">
          {messages.slice(0, -1).map((message) => (
            <li key={message} className="text-sm text-ink-400">
              <span className="mr-1.5 text-verified-600">✓</span>
              {message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
