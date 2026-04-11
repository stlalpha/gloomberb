import { createThrottledFetch } from "../../../utils/throttled-fetch";
import type { MarketNewsItem, NewsSource } from "../../../types/news-source";
import { parseRssFeed, type RssFeedConfig } from "./rss-parser";
import { enrichNewsItem } from "./categories";

const rssClient = createThrottledFetch({
  requestsPerMinute: 30,
  maxRetries: 1,
  timeoutMs: 10_000,
  defaultHeaders: {
    "User-Agent": "Gloomberb/0.4.1",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

export function createRssNewsSource(feeds: RssFeedConfig[], knownTickers?: Set<string>): NewsSource {
  return {
    id: "rss",
    name: "RSS Feeds",
    async fetchMarketNews(): Promise<MarketNewsItem[]> {
      const enabledFeeds = feeds.filter((f) => f.enabled);
      const results = await Promise.allSettled(
        enabledFeeds.map(async (feed) => {
          const resp = await rssClient.fetch(feed.url);
          if (!resp.ok) return [];
          const xml = await resp.text();
          return parseRssFeed(xml, feed);
        }),
      );

      const allItems: MarketNewsItem[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          allItems.push(...result.value);
        }
      }

      return allItems.map((item) => enrichNewsItem(item, knownTickers));
    },
  };
}
