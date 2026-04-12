import { describe, expect, test } from "bun:test";
import { parseRssFeed, type RssFeedConfig } from "./rss-parser";

const DEFAULT_CONFIG: RssFeedConfig = {
  id: "test-feed",
  url: "https://example.com/feed",
  name: "Test Feed",
  authority: 60,
  enabled: true,
};

const RSS2_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
  <title>Test Feed</title>
  <item>
    <title>Fed holds rates steady</title>
    <link>https://example.com/fed-rates</link>
    <pubDate>Thu, 10 Apr 2026 14:30:00 GMT</pubDate>
    <description>&lt;p&gt;The Federal Reserve held rates steady at 4.25%.&lt;/p&gt;</description>
    <category>Economy</category>
  </item>
  <item>
    <title><![CDATA[NVIDIA beats Q1 estimates]]></title>
    <link>https://example.com/nvda-q1</link>
    <pubDate>Thu, 10 Apr 2026 10:00:00 GMT</pubDate>
    <description>NVIDIA reported strong earnings.</description>
  </item>
  <item>
    <title>Oil surges on OPEC cuts</title>
    <link>https://example.com/oil-opec</link>
    <pubDate>Thu, 10 Apr 2026 08:00:00 GMT</pubDate>
  </item>
</channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Markets rally on trade deal</title>
    <link href="https://example.com/trade-deal"/>
    <published>2026-04-10T12:00:00Z</published>
    <summary>Global markets surged on news of a trade agreement.</summary>
  </entry>
</feed>`;

describe("parseRssFeed - RSS 2.0", () => {
  test("returns 3 items from fixture", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items).toHaveLength(3);
  });

  test("extracts title correctly", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.title).toBe("Fed holds rates steady");
  });

  test("extracts url correctly", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.url).toBe("https://example.com/fed-rates");
  });

  test("parses pubDate", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[0]!.publishedAt.getFullYear()).toBe(2026);
  });

  test("strips HTML from description", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.summary).not.toContain("<p>");
    expect(items[0]!.summary).toContain("Federal Reserve");
  });

  test("decodes HTML entities in description", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.summary).not.toContain("&lt;");
    expect(items[0]!.summary).not.toContain("&gt;");
  });

  test("handles CDATA in title", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[1]!.title).toBe("NVIDIA beats Q1 estimates");
  });

  test("handles missing description (no crash, no summary)", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[2]!.summary).toBeUndefined();
    expect(items[2]!.title).toBe("Oil surges on OPEC cuts");
  });

  test("extracts category from <category> tag", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.categories).toContain("Economy");
  });

  test("assigns source from config name", () => {
    const items = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    for (const item of items) {
      expect(item.source).toBe("Test Feed");
    }
  });

  test("generates stable IDs", () => {
    const items1 = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    const items2 = parseRssFeed(RSS2_FIXTURE, DEFAULT_CONFIG);
    expect(items1[0]!.id).toBe(items2[0]!.id);
  });
});

describe("parseRssFeed - Atom", () => {
  test("returns 1 entry from atom fixture", () => {
    const items = parseRssFeed(ATOM_FIXTURE, DEFAULT_CONFIG);
    expect(items).toHaveLength(1);
  });

  test("extracts title from atom entry", () => {
    const items = parseRssFeed(ATOM_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.title).toBe("Markets rally on trade deal");
  });

  test("extracts href link from atom entry", () => {
    const items = parseRssFeed(ATOM_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.url).toBe("https://example.com/trade-deal");
  });

  test("parses published date from atom entry", () => {
    const items = parseRssFeed(ATOM_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[0]!.publishedAt.getFullYear()).toBe(2026);
    expect(items[0]!.publishedAt.getMonth()).toBe(3); // April = 3
  });

  test("extracts summary from atom entry", () => {
    const items = parseRssFeed(ATOM_FIXTURE, DEFAULT_CONFIG);
    expect(items[0]!.summary).toContain("trade agreement");
  });
});

describe("parseRssFeed - edge cases", () => {
  test("returns empty array for empty string", () => {
    expect(parseRssFeed("", DEFAULT_CONFIG)).toHaveLength(0);
  });

  test("returns empty array for invalid XML", () => {
    expect(parseRssFeed("not xml at all <<<", DEFAULT_CONFIG)).toHaveLength(0);
  });

  test("returns empty array for whitespace-only input", () => {
    expect(parseRssFeed("   \n\t  ", DEFAULT_CONFIG)).toHaveLength(0);
  });

  test("truncates summary to 300 chars", () => {
    const longDesc = "x".repeat(400);
    const xml = `<rss version="2.0"><channel><item>
      <title>Long item</title>
      <link>https://example.com/long</link>
      <pubDate>Thu, 10 Apr 2026 08:00:00 GMT</pubDate>
      <description>${longDesc}</description>
    </item></channel></rss>`;
    const items = parseRssFeed(xml, DEFAULT_CONFIG);
    expect(items).toHaveLength(1);
    // 300 chars + ellipsis
    expect(items[0]!.summary!.length).toBeLessThanOrEqual(301);
    expect(items[0]!.summary!).toContain("…");
  });

  test("handles item with only a title (no link)", () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>Titleonly item</title>
    </item></channel></rss>`;
    const items = parseRssFeed(xml, DEFAULT_CONFIG);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Titleonly item");
  });

  test("uses config category when no <category> tag present", () => {
    const cfg: RssFeedConfig = { ...DEFAULT_CONFIG, category: "markets" };
    const items = parseRssFeed(RSS2_FIXTURE, cfg);
    // item[1] has no <category> tag
    expect(items[1]!.categories).toContain("markets");
  });
});
