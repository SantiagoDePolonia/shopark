import { randomUUID } from "node:crypto";
import { MATCH_THRESHOLD, matchOffer, productIdentity } from "../matching";
import { formatMoney, subtractMoney } from "../money";
import { computeTotal } from "../pricing";
import { resolveSearchMode, runProviders } from "../providers";
import { isGenericDemoOffer } from "../providers/demo";
import { rankOffers } from "../ranking";
import { tagRankedOffers } from "../tags";
import type { Offer, SearchMode, SearchResult, ShoppingIntent } from "../types";
import { VERIFY_TOP_N, verifyTopCandidates } from "../verification";
import { saveSearch } from "./store";

/**
 * The full deterministic pipeline:
 * discover → match → rank → verify top candidates → rerank → select.
 * The language model is never asked to choose the winner.
 */

export type ProgressReporter = (message: string) => void;

/**
 * Hybrid mode: demo offers are a safety net, never padding.
 * - Any usable live match hides ALL demo offers.
 * - Fabricated generic demo offers never appear in hybrid; only the
 *   curated scenarios may serve as a fallback when live finds nothing.
 */
export function applyHybridPolicy(
  matched: Offer[],
  rejected: Offer[],
): { matched: Offer[]; rejected: Offer[] } {
  const liveMatched = matched.filter((o) => o.discoverySource !== "demo");
  if (liveMatched.length > 0) {
    return {
      matched: liveMatched,
      rejected: rejected.filter((o) => o.discoverySource !== "demo"),
    };
  }
  return {
    matched: matched.filter((o) => !isGenericDemoOffer(o)),
    rejected: rejected.filter((o) => !isGenericDemoOffer(o)),
  };
}

export async function executeSearch(
  intent: ShoppingIntent,
  options: { mode?: SearchMode; onProgress?: ProgressReporter } = {},
): Promise<SearchResult> {
  const mode = options.mode ?? resolveSearchMode();
  const progress: string[] = [];
  const report = (message: string) => {
    progress.push(message);
    options.onProgress?.(message);
  };

  report("Searching across merchants…");
  const providerResults = await runProviders(intent, mode);
  const providerErrors = providerResults
    .filter((r) => r.error)
    .map((r) => `${r.providerId}: ${r.error}`);
  const discovered = providerResults.flatMap((r) => r.offers);
  report(`Found ${discovered.length} possible offers…`);

  report("Comparing offers against your requirements…");
  let matched: Offer[] = [];
  let rejected: Offer[] = [];
  for (const raw of discovered) {
    const match = matchOffer(intent, raw);
    const offer = { ...raw, match };
    if (match.rejectionReason) {
      rejected.push(offer);
    } else if (match.score >= MATCH_THRESHOLD) {
      matched.push(offer);
    }
    // Below-threshold, non-rejected offers are dropped as noise.
  }

  if (mode === "hybrid") {
    ({ matched, rejected } = applyHybridPolicy(matched, rejected));
  }

  // First ranking pass decides which candidates deserve verification.
  let outcome = rankOffers(matched, intent);
  const verificationRejected: Offer[] = [...outcome.rejected];

  // Verify in rounds: a changed price can push the winner down and pull
  // unverified candidates up, so re-verify until the top is inspected.
  let pool = outcome.ranked;
  for (let round = 0; round < 3; round++) {
    const pendingOnTop = pool.slice(0, VERIFY_TOP_N).some((o) => o.verification.status === "pending");
    if (!pendingOnTop) break;
    report(
      round === 0
        ? `Verifying the ${Math.min(VERIFY_TOP_N, pool.length)} cheapest on merchant pages…`
        : "Prices changed — re-checking the new leaders…",
    );
    pool = await verifyTopCandidates(pool);
    outcome = rankOffers([...pool, ...outcome.outOfBudget], intent);
    verificationRejected.push(...outcome.rejected);
    pool = outcome.ranked;
  }

  report("Selecting the best match…");
  const rankedAll = outcome.ranked;
  const winner = outcome.winner;

  // Split alternatives: same product elsewhere vs similar products.
  const winnerIdentity = winner ? productIdentity(winner) : null;
  const alternatives = rankedAll.filter((o) => o.id !== winner?.id);
  const sameProduct = winnerIdentity
    ? alternatives.filter((o) => productIdentity(o) === winnerIdentity)
    : [];
  const similar = alternatives.filter((o) => !winnerIdentity || productIdentity(o) !== winnerIdentity);

  const similarIds = new Set(similar.map((o) => o.id));
  const [taggedWinner] = winner ? tagRankedOffers([winner], new Set()) : [null];
  const taggedSame = tagRankedOffers(sameProduct, new Set());
  const taggedSimilar = tagRankedOffers(similar, similarIds);

  const allRejected = [...rejected, ...verificationRejected];

  const result: SearchResult = {
    searchId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    intent,
    phase: "done",
    progress,
    winner: taggedWinner,
    sameProductAlternatives: taggedSame.slice(0, 5),
    similarAlternatives: taggedSimilar.slice(0, 5),
    rejected: allRejected.slice(0, 10),
    providerErrors,
    summary: buildSummary(intent, taggedWinner, taggedSame, outcome.closestAboveBudget),
    closestAboveBudget: outcome.closestAboveBudget,
  };

  saveSearch(result);
  return result;
}

/** Deterministic, carefully-worded summary — no model, no invented claims. */
function buildSummary(
  intent: ShoppingIntent,
  winner: Offer | null,
  sameProduct: Offer[],
  closestAboveBudget: Offer | null,
): string {
  if (!winner) {
    if (closestAboveBudget && intent.budget) {
      const total = computeTotal(closestAboveBudget);
      const totalText = total !== undefined ? formatMoney(total, closestAboveBudget.pricing.currency) : "an unknown total";
      return `No matching verified offer was found below ${formatMoney(intent.budget.maximum, intent.budget.currency)}. The closest valid match costs ${totalText} delivered.`;
    }
    return "No matching offer was found for this request.";
  }

  const total = computeTotal(winner);
  const currency = winner.pricing.currency;
  const verified = winner.verification.status === "verified" || winner.verification.status === "changed";
  const parts: string[] = [];

  if (total !== undefined) {
    parts.push(
      verified
        ? `Best verified matching offer: ${winner.product.title} from ${winner.merchant.name} for ${formatMoney(total, currency)} in total.`
        : `Best found offer: ${winner.product.title} from ${winner.merchant.name}, estimated total ${formatMoney(total, currency)}.`,
    );
  } else {
    parts.push(
      `Best found offer: ${winner.product.title} from ${winner.merchant.name} for ${formatMoney(winner.pricing.discoveredPrice, currency)} plus unknown delivery.`,
    );
  }

  if (!verified) {
    parts.push("The current price could not be confirmed on the merchant page, so it may change.");
  }

  const runnerUp = sameProduct[0];
  const runnerUpTotal = runnerUp ? computeTotal(runnerUp) : undefined;
  if (total !== undefined && runnerUpTotal !== undefined && runnerUpTotal > total) {
    parts.push(
      `${formatMoney(subtractMoney(runnerUpTotal, total), currency)} cheaper than the next matching offer we checked.`,
    );
  }

  return parts.join(" ");
}
