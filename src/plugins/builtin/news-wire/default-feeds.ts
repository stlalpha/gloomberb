import type { RssFeedConfig } from "./rss-parser";

export const DEFAULT_FEEDS: RssFeedConfig[] = [
  // Tier 1 — Primary market news (authority 70-80)
  { id: "cnbc-top", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", name: "CNBC", category: "general", authority: 80, enabled: true },
  { id: "cnbc-markets", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html", name: "CNBC Markets", category: "finance", authority: 75, enabled: true },
  { id: "marketwatch-top", url: "https://feeds.marketwatch.com/marketwatch/topstories", name: "MarketWatch", category: "general", authority: 75, enabled: true },
  { id: "marketwatch-pulse", url: "https://feeds.marketwatch.com/marketwatch/marketpulse", name: "MarketWatch Pulse", category: "general", authority: 70, enabled: true },
  { id: "seeking-alpha-market-currents", url: "https://seekingalpha.com/market_currents.xml", name: "Seeking Alpha", category: "general", authority: 70, enabled: true },

  // Tier 2 — Sector-specific (authority 65)
  { id: "cnbc-tech", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", name: "CNBC Tech", category: "tech", authority: 65, enabled: true },
  { id: "cnbc-finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", name: "CNBC Finance", category: "finance", authority: 65, enabled: true },
  { id: "cnbc-energy", url: "https://www.cnbc.com/id/19836768/device/rss/rss.html", name: "CNBC Energy", category: "energy", authority: 65, enabled: true },
  { id: "cnbc-real-estate", url: "https://www.cnbc.com/id/10000115/device/rss/rss.html", name: "CNBC Real Estate", category: "realestate", authority: 65, enabled: true },

  // Tier 3 — Broad/international (authority 50-60)
  { id: "yahoo-finance", url: "https://finance.yahoo.com/news/rssindex", name: "Yahoo Finance", category: "general", authority: 55, enabled: true },
  { id: "seeking-alpha-analysis", url: "https://seekingalpha.com/feed.xml", name: "Seeking Alpha Analysis", category: "general", authority: 60, enabled: true },
  { id: "investing-com", url: "https://www.investing.com/rss/news.rss", name: "Investing.com", category: "general", authority: 50, enabled: true },
  { id: "nyt-business", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", name: "NYT Business", category: "general", authority: 55, enabled: true },
  { id: "bbc-business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business", category: "general", authority: 50, enabled: true },
  { id: "ft-home", url: "https://www.ft.com/rss/home", name: "Financial Times", category: "general", authority: 60, enabled: true },
];
