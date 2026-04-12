import type { MarketNewsItem, NewsSource } from "../types/news-source";

export interface NewsAggregatorOptions {
  pollIntervalMs?: number;
}

const MAX_ARTICLES = 500;
const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000;

export class NewsAggregator {
  private readonly sources = new Map<string, NewsSource>();
  private readonly listeners = new Set<() => void>();
  private articles: MarketNewsItem[] = [];
  private version = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pollIntervalMs: number;

  constructor(options: NewsAggregatorOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  register(source: NewsSource): () => void {
    this.sources.set(source.id, source);
    const cached = source.getCachedMarketNews?.() ?? [];
    if (cached.length > 0) {
      this.merge(cached);
      this.notify();
    }
    if (this.pollTimer !== null) {
      void this.poll();
    }
    return () => this.unregister(source.id);
  }

  unregister(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  start(): void {
    if (this.pollTimer !== null) return;
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion(): number {
    return this.version;
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  async poll(): Promise<void> {
    const allResults = await Promise.allSettled(
      Array.from(this.sources.values()).map((s) => s.fetchMarketNews()),
    );

    const incoming: MarketNewsItem[] = [];
    for (const result of allResults) {
      if (result.status === "fulfilled") {
        incoming.push(...result.value);
      }
    }

    this.merge(incoming);
    this.notify();
  }

  private merge(incoming: MarketNewsItem[]): void {
    // Build a map of existing articles by URL for dedup
    const byUrl = new Map<string, MarketNewsItem>();
    for (const item of this.articles) {
      byUrl.set(item.url, item);
    }

    for (const item of incoming) {
      const existing = byUrl.get(item.url);
      if (!existing || item.importance > existing.importance) {
        byUrl.set(item.url, item);
      }
    }

    // Sort by publishedAt descending, cap at MAX_ARTICLES
    const sorted = Array.from(byUrl.values()).sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
    );

    this.articles = sorted.slice(0, MAX_ARTICLES);
  }

  getTopStories(count = 20): MarketNewsItem[] {
    return [...this.articles]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count);
  }

  getFirehose(since?: Date, count = 100): MarketNewsItem[] {
    let items = this.articles;
    if (since) {
      const sinceMs = since.getTime();
      items = items.filter((item) => item.publishedAt.getTime() > sinceMs);
    }
    // articles is already sorted by publishedAt descending
    return items.slice(0, count);
  }

  getBySector(sector: string, count = 50): MarketNewsItem[] {
    return this.articles
      .filter((item) => item.categories.includes(sector))
      .slice(0, count);
  }

  getBreaking(count = 20): MarketNewsItem[] {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return this.articles
      .filter(
        (item) =>
          item.isBreaking ||
          (item.publishedAt.getTime() >= oneHourAgo && item.importance >= 70),
      )
      .slice(0, count);
  }
}
