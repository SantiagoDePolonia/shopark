/** The ShopArk mark: a hull cradling one dot — one trusted choice carried forward. */
export function LogoMark({ size = 26, onDark = false }: { size?: number; onDark?: boolean }) {
  const color = onDark ? "#ffffff" : "#1d1d1f";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M12 30c2.4 11.4 10 18 20 18s17.6-6.6 20-18"
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="26" r="7.5" fill={color} />
    </svg>
  );
}

export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark onDark={onDark} />
      <span
        className={`font-display text-xl font-semibold tracking-tight ${
          onDark ? "text-white" : "text-ink-900"
        }`}
      >
        ShopArk
      </span>
    </span>
  );
}
