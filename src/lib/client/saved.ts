"use client";

import { useSyncExternalStore } from "react";
import type { Offer } from "../types";
import { formatMoney } from "../money";
import { computeTotal, currentPrice } from "../pricing";

/**
 * Simple local persistence for bookmarked products and search history.
 * localStorage only — no accounts, no backend, survives reloads.
 */

export type SavedProduct = {
  id: string;
  title: string;
  price: string;
  merchant: string;
  url: string;
  imageUrl?: string;
  savedAt: number;
};

export type HistoryEntry = {
  query: string;
  at: number;
};

const PRODUCTS_KEY = "shopark.saved-products";
const HISTORY_KEY = "shopark.search-history";
const CHANGE_EVENT = "shopark-saved-changed";
const HISTORY_LIMIT = 20;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/* Snapshots are cached so useSyncExternalStore sees stable references. */
let productsCache: SavedProduct[] | null = null;
let historyCache: HistoryEntry[] | null = null;
const EMPTY: never[] = [];

function invalidate() {
  productsCache = null;
  historyCache = null;
}

function subscribe(callback: () => void): () => void {
  const handler = () => {
    invalidate();
    callback();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useSavedProducts(): SavedProduct[] {
  return useSyncExternalStore(
    subscribe,
    () => (productsCache ??= read<SavedProduct>(PRODUCTS_KEY)),
    () => EMPTY,
  );
}

export function useSearchHistory(): HistoryEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => (historyCache ??= read<HistoryEntry>(HISTORY_KEY)),
    () => EMPTY,
  );
}

export function offerToSaved(offer: Offer): SavedProduct {
  const total = computeTotal(offer);
  return {
    id: offer.id,
    title: offer.product.title,
    price:
      total !== undefined
        ? formatMoney(total, offer.pricing.currency)
        : `${formatMoney(currentPrice(offer), offer.pricing.currency)} + delivery`,
    merchant: offer.merchant.name,
    url: offer.url,
    imageUrl: offer.imageUrl,
    savedAt: Date.now(),
  };
}

export function toggleBookmark(offer: Offer): void {
  const products = read<SavedProduct>(PRODUCTS_KEY);
  const existing = products.findIndex((p) => p.id === offer.id);
  if (existing >= 0) {
    products.splice(existing, 1);
  } else {
    products.unshift(offerToSaved(offer));
  }
  write(PRODUCTS_KEY, products);
}

export function removeBookmark(id: string): void {
  write(
    PRODUCTS_KEY,
    read<SavedProduct>(PRODUCTS_KEY).filter((p) => p.id !== id),
  );
}

export function addHistoryEntry(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const history = read<HistoryEntry>(HISTORY_KEY).filter(
    (h) => h.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  history.unshift({ query: trimmed, at: Date.now() });
  write(HISTORY_KEY, history.slice(0, HISTORY_LIMIT));
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}
