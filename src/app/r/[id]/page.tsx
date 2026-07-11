/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { VerificationBadge } from "@/components/VerificationBadge";
import { formatMoney } from "@/lib/money";
import { computeTotal, currentPrice, knownShipping } from "@/lib/pricing";
import { parseIntent } from "@/lib/intent/openai";
import { executeSearch } from "@/lib/search/orchestrator";
import { getSearch } from "@/lib/search/store";
import type { Offer } from "@/lib/types";

/**
 * The page a watch QR code opens: one result, one action.
 * Server-rendered, minimal, built for a phone screen.
 */

export const dynamic = "force-dynamic";

function PriceRows({ offer }: { offer: Offer }) {
  const shipping = knownShipping(offer);
  const total = computeTotal(offer);
  const currency = offer.pricing.currency;
  return (
    <dl className="tnum mt-4 space-y-1 text-[15px]">
      <div className="flex justify-between text-ink-600">
        <dt>Product</dt>
        <dd>{formatMoney(currentPrice(offer), currency)}</dd>
      </div>
      <div className="flex justify-between text-ink-600">
        <dt>Delivery</dt>
        <dd>{shipping === undefined ? "Unknown" : shipping === 0 ? "Free" : formatMoney(shipping, currency)}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-foam-200 pt-2">
        <dt className="font-semibold">Total</dt>
        <dd className="font-display text-3xl font-bold">
          {total !== undefined ? formatMoney(total, currency) : `${formatMoney(currentPrice(offer), currency)} + delivery`}
        </dd>
      </div>
    </dl>
  );
}

export default async function WatchResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;

  // The store is per-instance memory: on serverless it can miss. The QR
  // carries the original request text, so a miss re-runs the same
  // deterministic pipeline instead of 404ing.
  let result = getSearch(id);
  if (!result && q) {
    const { intent } = await parseIntent(q.slice(0, 200));
    result = await executeSearch(intent);
  }
  if (!result) notFound();

  const winner = result.winner;
  const isConfirmed =
    winner &&
    (winner.verification.status === "verified" || winner.verification.status === "changed");

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-5 pb-12">
      <header className="flex items-center justify-between py-4">
        <Link href="/">
          <Wordmark />
        </Link>
        <span className="rounded-full bg-foam-100 px-3 py-1 text-xs text-ink-600">from your watch</span>
      </header>

      {!winner ? (
        <div className="pt-10 text-center">
          <p className="font-display text-2xl font-semibold">No matching offer</p>
          <p className="mt-3 text-ink-600">{result.summary}</p>
          <Link href="/" className="mt-8 inline-block rounded-control bg-ink-900 px-6 py-3 font-medium text-white">
            Search again
          </Link>
        </div>
      ) : (
        <article className="overflow-hidden rounded-card bg-white shadow-hero">
          <div className="bg-ocean-900 px-6 pt-5 pb-4">
            <p className="font-display text-xs font-medium uppercase tracking-[0.18em] text-ocean-300">
              {isConfirmed ? "Best verified matching offer" : "Best found offer"}
            </p>
          </div>
          <svg viewBox="0 0 400 20" className="-mt-px block w-full" aria-hidden="true" preserveAspectRatio="none">
            <path d="M0 0 Q200 40 400 0 Z" fill="#1d1d1f" />
          </svg>

          <div className="p-6 pt-3">
            {winner.imageUrl && (
              <img src={winner.imageUrl} alt="" className="h-28 w-28 rounded-2xl bg-foam-100 object-cover" />
            )}
            <h1 className="mt-3 font-display text-2xl font-semibold leading-tight">{winner.product.title}</h1>
            <p className="mt-1 text-sm text-ink-600">{winner.merchant.name}</p>
            <PriceRows offer={winner} />
            <div className="mt-4">
              <VerificationBadge status={winner.verification.status} />
            </div>
            {winner.verification.status === "unverifiable" && (
              <p className="mt-3 rounded-xl bg-caution-100 px-4 py-3 text-sm text-caution-700">
                The price comes from the discovery source and may change after opening the store.
              </p>
            )}
            <a
              href={winner.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 block rounded-control bg-ink-900 px-6 py-3.5 text-center font-display font-semibold text-white"
            >
              {isConfirmed ? "View offer" : "Check on merchant website"}
            </a>
          </div>
        </article>
      )}
    </div>
  );
}
