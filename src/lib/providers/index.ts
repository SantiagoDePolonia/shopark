import type {
  ProviderSearchResult,
  SearchContext,
  SearchMode,
  ShoppingIntent,
  ShoppingProvider,
} from "../types";
import { dataForSeoConfigured, dataForSeoProvider } from "./dataforseo";
import { demoProvider } from "./demo";
import { serpApiConfigured, serpApiProvider } from "./serpapi";

const PROVIDER_TIMEOUT_MS = 12_000;

function anyLiveProviderConfigured(): boolean {
  return serpApiConfigured() || dataForSeoConfigured();
}

export function resolveSearchMode(): SearchMode {
  const mode = process.env.SEARCH_MODE;
  if (mode === "live" || mode === "hybrid" || mode === "demo") {
    // Live modes silently degrade to demo when no provider is configured,
    // so the app always starts without credentials.
    if (mode !== "demo" && !anyLiveProviderConfigured()) return "demo";
    return mode;
  }
  return anyLiveProviderConfigured() ? "hybrid" : "demo";
}

function liveProviders(): ShoppingProvider[] {
  const providers: ShoppingProvider[] = [];
  if (serpApiConfigured()) providers.push(serpApiProvider);
  if (dataForSeoConfigured()) providers.push(dataForSeoProvider);
  return providers;
}

export function providersForMode(mode: SearchMode): ShoppingProvider[] {
  switch (mode) {
    case "live":
      return liveProviders();
    case "hybrid":
      return [...liveProviders(), demoProvider];
    case "demo":
      return [demoProvider];
  }
}

/**
 * Run all configured providers in parallel with independent timeouts.
 * One provider failing (or timing out) never fails the whole search.
 */
export async function runProviders(
  intent: ShoppingIntent,
  mode: SearchMode,
): Promise<ProviderSearchResult[]> {
  const context: SearchContext = { mode, timeoutMs: PROVIDER_TIMEOUT_MS };
  const providers = providersForMode(mode);

  return Promise.all(
    providers.map(async (provider) => {
      const timeoutMs = provider.timeoutMs ?? PROVIDER_TIMEOUT_MS;
      try {
        return await withTimeout(provider.search(intent, context), timeoutMs, provider.id);
      } catch (error) {
        return {
          providerId: provider.id,
          offers: [],
          error: error instanceof Error ? error.message : String(error),
          durationMs: timeoutMs,
        };
      }
    }),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Provider ${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}
