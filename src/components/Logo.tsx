/* eslint-disable @next/next/no-img-element */

/** The ShopArk mark: a ship's prow, carrying the choice forward. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/brand-mark.jpeg"
      alt=""
      width={size}
      height={size}
      className="rounded-md"
      aria-hidden="true"
    />
  );
}

export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
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
