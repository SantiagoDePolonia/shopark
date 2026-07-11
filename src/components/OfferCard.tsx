/* eslint-disable @next/next/no-img-element */
import { formatMoney, subtractMoney } from "@/lib/money";
import { computeTotal, currentPrice, knownShipping } from "@/lib/pricing";
import type { Offer } from "@/lib/types";
import { VerificationBadge } from "./VerificationBadge";

function variantLine(offer: Offer): string {
  const bits: string[] = [];
  if (offer.product.attributes.size) bits.push(`Size ${offer.product.attributes.size}`);
  if (offer.product.attributes.capacity) bits.push(offer.product.attributes.capacity);
  if (offer.product.condition !== "unknown")
    bits.push(offer.product.condition.charAt(0).toUpperCase() + offer.product.condition.slice(1));
  return bits.join(" · ");
}

export function WinnerCard({
  offer,
  runnerUpTotal,
  onRestart,
}: {
  offer: Offer;
  runnerUpTotal?: number;
  onRestart: () => void;
}) {
  const total = computeTotal(offer);
  const shipping = knownShipping(offer);
  const currency = offer.pricing.currency;
  const isConfirmed = offer.verification.status === "verified" || offer.verification.status === "changed";
  const savings =
    total !== undefined && runnerUpTotal !== undefined && runnerUpTotal > total
      ? subtractMoney(runnerUpTotal, total)
      : undefined;

  return (
    <article className="rise-in overflow-hidden rounded-card bg-white shadow-hero">
      {/* Crest: the hull arc carrying the verdict */}
      <div className="bg-ocean-900 px-6 pt-5 pb-4">
        <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-ocean-300">
          {isConfirmed ? "Best verified matching offer" : "Best found offer"}
        </p>
      </div>
      <svg viewBox="0 0 400 20" className="-mt-px block w-full" aria-hidden="true" preserveAspectRatio="none">
        <path d="M0 0 Q200 40 400 0 Z" fill="#1d1d1f" />
      </svg>

      <div className="flex flex-col gap-5 p-6 pt-3 sm:flex-row">
        {offer.imageUrl && (
          <img
            src={offer.imageUrl}
            alt=""
            className="h-32 w-32 shrink-0 rounded-2xl bg-foam-100 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold leading-tight text-ink-900">
            {offer.product.title}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {variantLine(offer)}
            {variantLine(offer) && " · "}
            {offer.merchant.name}
            {offer.merchant.rating !== undefined && (
              <span className="text-ink-400"> ★ {offer.merchant.rating.toFixed(1)}</span>
            )}
          </p>

          <dl className="tnum mt-4 space-y-1 text-[15px]">
            <div className="flex justify-between text-ink-600">
              <dt>Product</dt>
              <dd>{formatMoney(currentPrice(offer), currency)}</dd>
            </div>
            <div className="flex justify-between text-ink-600">
              <dt>Delivery</dt>
              <dd>
                {shipping === undefined
                  ? "Unknown"
                  : shipping === 0
                    ? "Free"
                    : formatMoney(shipping, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-foam-200 pt-2 text-ink-900">
              <dt className="font-semibold">{isConfirmed ? "Total" : "Estimated total"}</dt>
              <dd className="font-display text-3xl font-bold">
                {total !== undefined
                  ? formatMoney(total, currency)
                  : `${formatMoney(currentPrice(offer), currency)} + delivery`}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={offer.verification.status} />
          {offer.tags
            .filter((t) => t !== "Price verified" && t !== "Unverified price")
            .map((tag) => (
              <span key={tag} className="rounded-full bg-foam-100 px-3 py-1 text-sm text-ink-600">
                {tag}
              </span>
            ))}
        </div>

        {isConfirmed && offer.verification.checkedAt && (
          <p className="mt-3 text-sm text-ink-600">
            Checked on the merchant website{" "}
            {relativeTime(offer.verification.checkedAt)}.
          </p>
        )}
        {offer.verification.status === "unverifiable" && (
          <p className="mt-3 rounded-xl bg-caution-100 px-4 py-3 text-sm text-caution-700">
            {offer.verification.reason ?? "The merchant blocked automatic verification."} The price
            comes from the discovery source and may change after opening the store.
          </p>
        )}
        {offer.pricing.couponDescription && (
          <p className="mt-3 text-sm text-caution-700">{offer.pricing.couponDescription}.</p>
        )}
        {savings !== undefined && (
          <p className="mt-3 text-sm font-medium text-verified-600">
            {formatMoney(savings, currency)} cheaper than the next matching offer we checked.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-control bg-coral-500 px-6 py-3.5 text-center font-display text-base font-semibold text-white transition-colors hover:bg-coral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-600"
          >
            {isConfirmed ? "View offer" : "Check on merchant website"}
          </a>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-control border border-foam-200 px-6 py-3.5 font-medium text-ink-600 transition-colors hover:bg-foam-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600"
          >
            New search
          </button>
        </div>
      </div>
    </article>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
}
