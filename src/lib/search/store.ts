import type { SearchResult } from "../types";

/**
 * In-memory search store. Good enough for a demo; swap for SQLite or
 * Supabase behind the same functions if persistence is ever needed.
 */

// Anchored on globalThis so every route bundle (API handlers, server
// components) sees the same map — separate module instances otherwise
// get separate maps in dev.
const globalStore = globalThis as unknown as { __shoparkSearches?: Map<string, SearchResult> };
const searches = (globalStore.__shoparkSearches ??= new Map<string, SearchResult>());
const MAX_ENTRIES = 200;

export function saveSearch(result: SearchResult): void {
  if (searches.size >= MAX_ENTRIES) {
    const oldest = searches.keys().next().value;
    if (oldest) searches.delete(oldest);
  }
  searches.set(result.searchId, result);
}

export function getSearch(searchId: string): SearchResult | undefined {
  return searches.get(searchId);
}

export function listSearches(): SearchResult[] {
  return [...searches.values()].reverse();
}
