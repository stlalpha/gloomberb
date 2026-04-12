import { createThrottledFetch } from "../../../utils/throttled-fetch";
import type { MarketNewsItem, NewsSource } from "../../../types/news-source";
import type { PluginPersistence } from "../../../types/plugin";
import { parseRssFeed, type RssFeedConfig } from "./rss-parser";
import { enrichNewsItem } from "./categories";

const RSS_CACHE_KIND = "rss-feed";
export const RSS_FEED_CACHE_POLICY = {
  staleMs: 2 * 60 * 1000,
  expireMs: 7 * 24 * 60 * 60 * 1000,
} as const;

interface CachedNewsItem extends Omit<MarketNewsItem, "publishedAt"> {
  publishedAt: string;
}

interface CachedFeedPayload {
  items: CachedNewsItem[];
}

const rssClient = createThrottledFetch({
  requestsPerMinute: 30,
  maxRetries: 1,
  timeoutMs: 10_000,
  defaultHeaders: {
    "User-Agent": "Gloomberb/0.4.1",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

export interface RssNewsSourceOptions {
  knownTickers?: Set<string>;
  persistence?: PluginPersistence;
  fetchText?: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
}

function serializeItem(item: MarketNewsItem): CachedNewsItem {
  return {
    ...item,
    publishedAt: item.publishedAt.toISOString(),
  };
}

function deserializeItem(item: unknown): MarketNewsItem | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.url !== "string") return null;
  if (typeof record.source !== "string") return null;
  const publishedAt = new Date(String(record.publishedAt ?? ""));
  if (Number.isNaN(publishedAt.getTime())) return null;

  return {
    id: record.id,
    title: record.title,
    url: record.url,
    source: record.source,
    publishedAt,
    summary: typeof record.summary === "string" ? record.summary : undefined,
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : undefined,
    categories: Array.isArray(record.categories)
      ? record.categories.filter((entry): entry is string => typeof entry === "string")
      : [],
    tickers: Array.isArray(record.tickers)
      ? record.tickers.filter((entry): entry is string => typeof entry === "string")
      : [],
    importance: typeof record.importance === "number" ? record.importance : 0,
    isBreaking: record.isBreaking === true,
  };
}

function readFeedCache(
  persistence: PluginPersistence | undefined,
  feed: RssFeedConfig,
  options?: { allowExpired?: boolean; allowStale?: boolean },
): MarketNewsItem[] | null {
  const cached = persistence?.getResource<CachedFeedPayload>(RSS_CACHE_KIND, feed.id, {
    sourceKey: feed.url,
    allowExpired: options?.allowExpired,
  });
  if (cached?.stale && !options?.allowStale && !options?.allowExpired) return null;
  if (!cached?.value || !Array.isArray(cached.value.items)) return null;
  const items = cached.value.items
    .map(deserializeItem)
    .filter((item): item is MarketNewsItem => !!item);
  return items.length > 0 ? items : null;
}

function writeFeedCache(
  persistence: PluginPersistence | undefined,
  feed: RssFeedConfig,
  items: MarketNewsItem[],
): void {
  if (!persistence) return;
  persistence.setResource<CachedFeedPayload>(RSS_CACHE_KIND, feed.id, {
    items: items.map(serializeItem),
  }, {
    sourceKey: feed.url,
    cachePolicy: RSS_FEED_CACHE_POLICY,
    provenance: { url: feed.url, name: feed.name },
  });
}

export function createRssNewsSource(
  feedsOrGetter: RssFeedConfig[] | (() => RssFeedConfig[]),
  options: RssNewsSourceOptions = {},
): NewsSource {
  const fetchText = options.fetchText ?? ((url: string) => rssClient.fetch(url));
  const getFeeds = () => Array.isArray(feedsOrGetter) ? feedsOrGetter : feedsOrGetter();

  async function fetchFeed(feed: RssFeedConfig): Promise<MarketNewsItem[]> {
    const freshCache = readFeedCache(options.persistence, feed);
    if (freshCache) return freshCache;

    try {
      const resp = await fetchText(feed.url);
      if (!resp.ok) return readFeedCache(options.persistence, feed, { allowExpired: true }) ?? [];
      const xml = await resp.text();
      const items = parseRssFeed(xml, feed)
        .map((item) => enrichNewsItem(item, feed.authority, options.knownTickers));
      writeFeedCache(options.persistence, feed, items);
      return items;
    } catch {
      return readFeedCache(options.persistence, feed, { allowExpired: true }) ?? [];
    }
  }

  return {
    id: "rss",
    name: "RSS Feeds",
    getCachedMarketNews(): MarketNewsItem[] {
      const enabledFeeds = getFeeds().filter((feed) => feed.enabled);
      return enabledFeeds.flatMap((feed) => readFeedCache(options.persistence, feed, { allowExpired: true }) ?? []);
    },
    async fetchMarketNews(): Promise<MarketNewsItem[]> {
      const enabledFeeds = getFeeds().filter((f) => f.enabled);
      const results = await Promise.allSettled(
        enabledFeeds.map(fetchFeed),
      );

      const allItems: MarketNewsItem[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          allItems.push(...result.value);
        }
      }

      return allItems;
    },
  };
}
