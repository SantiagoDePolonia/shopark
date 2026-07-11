"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { formatMoney, subtractMoney } from "@/lib/money";
import { computeTotal, currentPrice } from "@/lib/pricing";
import type { Offer } from "@/lib/types";
import { VerificationBadge } from "./VerificationBadge";

function AlternativeRow({ offer, winnerTotal }: { offer: Offer; winnerTotal?: number }) {
  const total = computeTotal(offer);
  const diff =
    total !== undefined && winnerTotal !== undefined ? subtractMoney(total, winnerTotal) : undefined;

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card">
      {offer.imageUrl && (
        <img src={offer.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-foam-100 object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{offer.product.title}</p>
        <p className="truncate text-xs text-ink-600">{offer.merchant.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <VerificationBadge status={offer.verification.status} compact />
          {offer.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-foam-100 px-2 py-0.5 text-xs text-ink-600">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="tnum shrink-0 text-right">
        <p className="font-display text-base font-bold text-ink-900">
          {formatMoney(total ?? currentPrice(offer), offer.pricing.currency)}
        </p>
        {total === undefined && <p className="text-xs text-ink-400">+ delivery</p>}
        {diff !== undefined && diff > 0 && (
          <p className="text-xs text-ink-400">+{formatMoney(diff, offer.pricing.currency)}</p>
        )}
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-ocean-600 underline-offset-2 hover:underline"
        >
          Open
        </a>
      </div>
    </li>
  );
}

export function AlternativesList({
  sameProduct,
  similar,
  winnerTotal,
}: {
  sameProduct: Offer[];
  similar: Offer[];
  winnerTotal?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = sameProduct.length + similar.length;
  if (count === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-4 w-full rounded-control border border-foam-200 bg-white px-6 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-foam-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600"
      >
        Show {count} alternative{count === 1 ? "" : "s"}
      </button>
    );
  }

  return (
    <div className="rise-in mt-6 space-y-5">
      {sameProduct.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Other offers for the same product
          </h3>
          <ul className="space-y-2">
            {sameProduct.map((o) => (
              <AlternativeRow key={o.id} offer={o} winnerTotal={winnerTotal} />
            ))}
          </ul>
        </section>
      )}
      {similar.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-400">
            Similar products
          </h3>
          <ul className="space-y-2">
            {similar.map((o) => (
              <AlternativeRow key={o.id} offer={o} winnerTotal={winnerTotal} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
