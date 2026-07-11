/**
 * The signature searching animation: the ShopArk ship rides the waves
 * while progress messages narrate discover → compare → verify → select.
 */
export function SearchProgress({ messages }: { messages: string[] }) {
  const current = messages[messages.length - 1] ?? "Understanding your request…";

  return (
    <div className="rise-in flex flex-col items-center gap-6 py-10">
      <div className="relative h-28 w-72 overflow-hidden" aria-hidden="true">
        {/* Back wave: slower, lighter — depth without noise */}
        <svg viewBox="0 0 360 112" className="wave-shift-slow absolute left-0 top-0 h-28 w-[450px]">
          <path
            d="M0 78 Q22 66 45 78 T90 78 T135 78 T180 78 T225 78 T270 78 T315 78 T360 78"
            fill="none"
            stroke="#e8e8ed"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        {/* The ship: hull echoing the logo mark, gently bobbing */}
        <div className="ship-bob absolute left-1/2 top-[46px] -ml-7">
          <svg width="56" height="52" viewBox="-28 -44 56 52">
            {/* mast */}
            <line x1="0" y1="-40" x2="0" y2="-4" stroke="#1d1d1f" strokeWidth="2.5" strokeLinecap="round" />
            {/* pennant */}
            <path d="M0 -40 L10 -36.5 L0 -33 Z" fill="#1d1d1f" />
            {/* main sail */}
            <path d="M3 -34 Q17 -22 15 -7 L3 -7 Z" fill="#1d1d1f" />
            {/* jib sail */}
            <path d="M-3 -30 Q-15 -20 -13 -7 L-3 -7 Z" fill="#d2d2d7" />
            {/* hull — the logo's arc, carrying the choice forward */}
            <path d="M-24 -4 L24 -4 Q15 8 0 8 Q-15 8 -24 -4 Z" fill="#1d1d1f" />
          </svg>
        </div>

        {/* Front wave: the water line the ship sits in */}
        <svg viewBox="0 0 360 112" className="wave-shift absolute left-0 top-0 h-28 w-[450px]">
          <path
            d="M0 88 Q22 76 45 88 T90 88 T135 88 T180 88 T225 88 T270 88 T315 88 T360 88"
            fill="none"
            stroke="#b9b9be"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
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
