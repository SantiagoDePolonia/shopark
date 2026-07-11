import type { VerificationStatus } from "@/lib/types";

const CONFIG: Record<
  VerificationStatus,
  { label: string; className: string; kind: "ok" | "caution" | "danger" | "muted" }
> = {
  verified: {
    label: "Price and availability verified",
    className: "bg-verified-100 text-verified-600",
    kind: "ok",
  },
  changed: {
    label: "Price re-checked on the merchant page",
    className: "bg-verified-100 text-verified-600",
    kind: "ok",
  },
  unverifiable: {
    label: "Current price could not be confirmed",
    className: "bg-caution-100 text-caution-700",
    kind: "caution",
  },
  pending: {
    label: "Not yet verified",
    className: "bg-foam-100 text-ink-600",
    kind: "muted",
  },
  unavailable: {
    label: "Unavailable",
    className: "bg-danger-100 text-danger-600",
    kind: "danger",
  },
  mismatched: {
    label: "Different product on the page",
    className: "bg-danger-100 text-danger-600",
    kind: "danger",
  },
};

export function VerificationBadge({
  status,
  compact = false,
}: {
  status: VerificationStatus;
  compact?: boolean;
}) {
  const config = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.className} ${
        compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {config.kind === "ok" && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8.5 6.5 12 13 4.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="draw-check"
          />
        </svg>
      )}
      {config.kind === "caution" && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1.5 15 14H1L8 1.5Zm-.9 5h1.8l-.2 4h-1.4l-.2-4Zm.9 6.8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
        </svg>
      )}
      {config.kind === "danger" && (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      )}
      {compact
        ? { verified: "Verified", changed: "Re-checked", unverifiable: "Unverified", pending: "Pending", unavailable: "Unavailable", mismatched: "Mismatch" }[status]
        : config.label}
    </span>
  );
}
