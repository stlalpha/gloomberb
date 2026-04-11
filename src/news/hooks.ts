import { useSyncExternalStore } from "react";
import type { NewsAggregator } from "./aggregator";
import type { MarketNewsItem } from "../types/news-source";

let sharedAggregator: NewsAggregator | null = null;

export function setSharedNewsAggregator(agg: NewsAggregator): void {
  sharedAggregator = agg;
}

export function getSharedNewsAggregator(): NewsAggregator | null {
  return sharedAggregator;
}

function useAggregatorVersion(): number {
  if (!sharedAggregator) return 0;
  return useSyncExternalStore(
    (cb) => sharedAggregator!.subscribe(cb),
    () => sharedAggregator!.getVersion(),
  );
}

export function useTopStories(count = 20): MarketNewsItem[] {
  useAggregatorVersion();
  return sharedAggregator?.getTopStories(count) ?? [];
}

export function useFirehose(count = 100): MarketNewsItem[] {
  useAggregatorVersion();
  return sharedAggregator?.getFirehose(undefined, count) ?? [];
}

export function useSectorNews(sector: string, count = 50): MarketNewsItem[] {
  useAggregatorVersion();
  return sharedAggregator?.getBySector(sector, count) ?? [];
}

export function useBreakingNews(count = 20): MarketNewsItem[] {
  useAggregatorVersion();
  return sharedAggregator?.getBreaking(count) ?? [];
}
