import type {
  PredictionCategoryId,
  PredictionHistoryRange,
  PredictionMarketDetail,
  PredictionMarketSummary,
  PredictionVenue,
} from "./types";

export function buildPredictionCatalogCacheKey(
  venue: PredictionVenue,
  categoryId: PredictionCategoryId,
  searchQuery: string,
): string {
  return `${venue}|${categoryId}|${searchQuery.trim().toLowerCase()}`;
}

export function buildPredictionCatalogResourceKey(
  venue: PredictionVenue,
  categoryId: PredictionCategoryId,
  searchQuery: string,
): string {
  return `${venue}:${categoryId}:${searchQuery.trim().toLowerCase() || "all"}`;
}

export function buildPredictionDetailCacheKey(
  marketKey: string,
  historyRange: PredictionHistoryRange,
): string {
  return `${marketKey}|${historyRange}`;
}

export function buildPredictionDetailResourceKey(
  marketKey: string,
  historyRange: PredictionHistoryRange,
): string {
  return `${marketKey}:${historyRange}`;
}

export function updatePredictionCatalogCacheEntries(
  current: Record<string, PredictionMarketSummary[]>,
  marketKey: string,
  updater: (summary: PredictionMarketSummary) => PredictionMarketSummary,
): Record<string, PredictionMarketSummary[]> {
  let changed = false;
  const next: Record<string, PredictionMarketSummary[]> = {};

  for (const [cacheKey, markets] of Object.entries(current)) {
    let cacheChanged = false;
    next[cacheKey] = markets.map((market) => {
      if (market.key !== marketKey) return market;
      cacheChanged = true;
      return updater(market);
    });
    changed = changed || cacheChanged;
  }

  return changed ? next : current;
}

export function updatePredictionDetailCacheEntries(
  current: Record<string, PredictionMarketDetail>,
  marketKey: string,
  updater: (detail: PredictionMarketDetail) => PredictionMarketDetail,
): Record<string, PredictionMarketDetail> {
  let changed = false;
  const next: Record<string, PredictionMarketDetail> = {};
  const prefix = `${marketKey}|`;

  for (const [cacheKey, detail] of Object.entries(current)) {
    if (!cacheKey.startsWith(prefix)) {
      next[cacheKey] = detail;
      continue;
    }
    changed = true;
    next[cacheKey] = updater(detail);
  }

  return changed ? next : current;
}

export function updatePredictionPendingCounts(
  current: Record<string, number>,
  key: string,
  delta: number,
): Record<string, number> {
  const nextValue = Math.max(0, (current[key] ?? 0) + delta);
  if ((current[key] ?? 0) === nextValue) {
    return current;
  }

  if (nextValue === 0) {
    if (!(key in current)) return current;
    const next = { ...current };
    delete next[key];
    return next;
  }

  return {
    ...current,
    [key]: nextValue,
  };
}

export function updatePredictionErrorState(
  current: Record<string, string | null>,
  key: string,
  value: string | null,
): Record<string, string | null> {
  if ((current[key] ?? null) === value) return current;
  return {
    ...current,
    [key]: value,
  };
}
