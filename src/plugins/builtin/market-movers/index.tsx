import { useEffect, useRef, useState } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { colors, hoverBg, priceColor, blendHex } from "../../../theme/colors";
import { formatCurrency, formatCompact, formatPercentRaw } from "../../../utils/format";
import { getSharedDataProvider, getSharedRegistry } from "../../registry";
import {
  fetchScreener,
  fetchTrending,
  MARKET_SUMMARY_SYMBOLS,
  type ScreenerCategory,
  type ScreenerQuote,
  type MarketSummaryQuote,
} from "./screener";

const CACHE_TTL_MS = 5 * 60 * 1000;

type TabId = "gainers" | "losers" | "actives" | "trending";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "actives", label: "Most Active" },
  { id: "trending", label: "Trending" },
];

const CATEGORY_MAP: Record<Exclude<TabId, "trending">, ScreenerCategory> = {
  gainers: "day_gainers",
  losers: "day_losers",
  actives: "most_actives",
};

interface TabCache {
  data: ScreenerQuote[];
  fetchedAt: number;
}

function formatVolRatio(ratio: number): string {
  if (ratio <= 0) return "—";
  if (ratio >= 10) return `${Math.round(ratio)}x`;
  return `${ratio.toFixed(1)}x`;
}

function volRatioColor(ratio: number): string {
  if (ratio >= 3) return colors.textBright;
  if (ratio >= 1.5) return colors.text;
  return colors.textDim;
}

function fiftyTwoWeekPosition(price: number, low: number | undefined, high: number | undefined): string {
  if (low == null || high == null || high <= low) return "—";
  const pct = ((price - low) / (high - low)) * 100;
  return `${Math.round(pct)}%`;
}

const INDEX_SHORT: Record<string, string> = {
  "^GSPC": "SPX",
  "^DJI": "DJIA",
  "^IXIC": "COMP",
  "^RUT": "RUT",
};

export function MarketMoversPane({ focused, width, height }: PaneProps) {
  const registry = getSharedRegistry();
  const [activeTab, setActiveTab] = useState<TabId>("gainers");
  const [quotes, setQuotes] = useState<ScreenerQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [summaryQuotes, setSummaryQuotes] = useState<MarketSummaryQuote[]>([]);

  const cacheRef = useRef<Map<TabId, TabCache>>(new Map());
  const fetchGenRef = useRef(0);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  // Fetch market summary via the provider router
  useEffect(() => {
    const provider = getSharedDataProvider();
    const loadSummary = async () => {
      const results: MarketSummaryQuote[] = [];
      await Promise.allSettled(
        MARKET_SUMMARY_SYMBOLS.map(async (symbol) => {
          try {
            const q = await provider.getQuote(symbol, "");
            if (q) {
              results.push({
                symbol,
                name: q.name ?? symbol,
                price: q.price,
                change: q.change,
                changePercent: q.changePercent,
              });
            }
          } catch { /* skip */ }
        }),
      );
      // Preserve the original symbol order
      setSummaryQuotes(
        MARKET_SUMMARY_SYMBOLS
          .map((s) => results.find((r) => r.symbol === s))
          .filter((r): r is MarketSummaryQuote => r !== undefined),
      );
    };
    loadSummary();
    const interval = setInterval(loadSummary, 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadTab = async (tab: TabId) => {
    const cached = cacheRef.current.get(tab);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setQuotes(cached.data);
      setSelectedIdx(0);
      return;
    }

    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    setLoading(true);

    try {
      let data: ScreenerQuote[];

      if (tab === "trending") {
        const trending = await fetchTrending(25);
        if (fetchGenRef.current !== gen) return;

        const provider = getSharedDataProvider();
        const resolved: ScreenerQuote[] = [];

        await Promise.allSettled(
          trending.slice(0, 25).map(async ({ symbol }) => {
            try {
              const q = await provider.getQuote(symbol, "");
              if (fetchGenRef.current !== gen) return;
              if (q) {
                resolved.push({
                  symbol,
                  name: q.name ?? symbol,
                  price: q.price ?? 0,
                  change: q.change ?? 0,
                  changePercent: q.changePercent ?? 0,
                  volume: q.volume ?? 0,
                  avgVolume: 0,
                  volumeRatio: 0,
                  marketCap: undefined,
                  currency: q.currency ?? "USD",
                  fiftyTwoWeekHigh: undefined,
                  fiftyTwoWeekLow: undefined,
                  dayHigh: undefined,
                  dayLow: undefined,
                  exchange: "",
                });
              }
            } catch { /* skip */ }
          }),
        );

        if (fetchGenRef.current !== gen) return;
        data = trending
          .map((t) => resolved.find((r) => r.symbol === t.symbol))
          .filter((r): r is ScreenerQuote => r !== undefined);
      } else {
        data = await fetchScreener(CATEGORY_MAP[tab], 25);
        if (fetchGenRef.current !== gen) return;
      }

      cacheRef.current.set(tab, { data, fetchedAt: Date.now() });
      setQuotes(data);
      setSelectedIdx(0);
    } catch { /* leave existing data */ }
    finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
  };

  useEffect(() => { loadTab(activeTab); }, [activeTab]);

  const openSelected = (idx: number) => {
    const q = quotes[idx];
    if (!q) return;
    registry?.navigateTickerFn(q.symbol);
  };

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "tab" || event.name === "right" || event.name === "l") {
      const currentTabIdx = TABS.findIndex((t) => t.id === activeTab);
      setActiveTab(TABS[(currentTabIdx + 1) % TABS.length]!.id);
      setSelectedIdx(0);
    } else if (event.name === "left" || event.name === "h") {
      const currentTabIdx = TABS.findIndex((t) => t.id === activeTab);
      setActiveTab(TABS[(currentTabIdx - 1 + TABS.length) % TABS.length]!.id);
      setSelectedIdx(0);
    } else if (event.name === "j" || event.name === "down") {
      setSelectedIdx((prev) => Math.min(prev + 1, quotes.length - 1));
    } else if (event.name === "k" || event.name === "up") {
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (event.name === "return") {
      openSelected(selectedIdx);
    } else if (event.name === "r") {
      cacheRef.current.delete(activeTab);
      loadTab(activeTab);
    }
  });

  // Scroll to keep selected row visible
  useEffect(() => {
    const sb = scrollRef.current;
    if (!sb?.viewport || quotes.length === 0 || selectedIdx < 0) return;
    const viewportHeight = Math.max(sb.viewport.height, 1);
    if (selectedIdx < sb.scrollTop) {
      sb.scrollTo(selectedIdx);
    } else if (selectedIdx >= sb.scrollTop + viewportHeight) {
      sb.scrollTo(selectedIdx - viewportHeight + 1);
    }
  }, [selectedIdx, quotes.length]);

  // Column widths — adaptive based on pane width
  const compact = width < 90;
  const rankWidth = 3;
  const tickerWidth = 8;
  const priceWidth = 11;
  const chgWidth = 9;
  const volWidth = compact ? 0 : 8;
  const volRatioWidth = compact ? 0 : 6;
  const rangeWidth = compact ? 0 : 6;
  const mcapWidth = compact ? 0 : 8;
  const fixedWidth = rankWidth + tickerWidth + priceWidth + chgWidth + volWidth + volRatioWidth + rangeWidth + mcapWidth + 2;
  const nameWidth = Math.max(6, width - fixedWidth);

  const summaryBg = blendHex(colors.bg, colors.border, 0.2);

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Market Summary Bar */}
      {summaryQuotes.length > 0 ? (
        <box flexDirection="row" height={1} backgroundColor={summaryBg} paddingX={1} gap={2}>
          {summaryQuotes.map((idx) => {
            const short = INDEX_SHORT[idx.symbol] ?? idx.symbol;
            const chgColor = priceColor(idx.changePercent);
            return (
              <box key={idx.symbol} flexDirection="row" gap={1}>
                <text fg={colors.textBright} attributes={TextAttributes.BOLD}>{short}</text>
                <text fg={colors.text}>{formatCurrency(idx.price, "USD")}</text>
                <text fg={chgColor}>{formatPercentRaw(idx.changePercent)}</text>
              </box>
            );
          })}
          {loading && <text fg={colors.textMuted}> loading…</text>}
        </box>
      ) : null}

      {/* Tab bar */}
      <box flexDirection="row" height={1} paddingX={1}>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <box
              key={tab.id}
              paddingX={1}
              marginRight={1}
              onMouseDown={(event: any) => {
                event.preventDefault?.();
                setActiveTab(tab.id);
                setSelectedIdx(0);
              }}
            >
              <text
                fg={isActive ? colors.textBright : colors.textDim}
                attributes={isActive ? TextAttributes.BOLD | TextAttributes.UNDERLINE : TextAttributes.NORMAL}
              >
                {tab.label}
              </text>
            </box>
          );
        })}
        <box flexGrow={1} />
        <text fg={colors.textMuted}>{quotes.length} stocks</text>
      </box>

      {/* Column headers */}
      <box flexDirection="row" paddingX={1} height={1}>
        <box width={rankWidth}>
          <text fg={colors.textDim}>#</text>
        </box>
        <box width={tickerWidth}>
          <text fg={colors.textDim}>TICKER</text>
        </box>
        <box width={nameWidth} flexShrink={1}>
          <text fg={colors.textDim}>NAME</text>
        </box>
        <box width={priceWidth} justifyContent="flex-end" paddingRight={1}>
          <text fg={colors.textDim}>LAST</text>
        </box>
        <box width={chgWidth} justifyContent="flex-end" paddingRight={1}>
          <text fg={colors.textDim}>CHG%</text>
        </box>
        {!compact && (
          <>
            <box width={volWidth} justifyContent="flex-end" paddingRight={1}>
              <text fg={colors.textDim}>VOL</text>
            </box>
            <box width={volRatioWidth} justifyContent="flex-end" paddingRight={1}>
              <text fg={colors.textDim}>V/AVG</text>
            </box>
            <box width={rangeWidth} justifyContent="flex-end" paddingRight={1}>
              <text fg={colors.textDim}>52W%</text>
            </box>
            <box width={mcapWidth} justifyContent="flex-end">
              <text fg={colors.textDim}>MCAP</text>
            </box>
          </>
        )}
      </box>

      {/* Rows */}
      <scrollbox ref={scrollRef} flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {quotes.map((q, idx) => {
            const isSelected = idx === selectedIdx;
            const isHovered = idx === hoveredIdx;
            const bg = isSelected ? colors.selected : isHovered ? hoverBg() : undefined;
            const fg = isSelected ? colors.selectedText : colors.text;
            const chgColor = isSelected ? colors.selectedText : priceColor(q.changePercent);

            return (
              <box
                key={`${q.symbol}-${idx}`}
                flexDirection="row"
                width={width}
                backgroundColor={bg}
                paddingX={1}
                onMouseMove={() => setHoveredIdx(idx)}
                onMouseOut={() => setHoveredIdx(null)}
                onMouseDown={(event: any) => {
                  event.preventDefault?.();
                  if (selectedIdx === idx) {
                    openSelected(idx);
                  } else {
                    setSelectedIdx(idx);
                  }
                }}
              >
                <box width={rankWidth} flexShrink={0}>
                  <text fg={isSelected ? colors.selectedText : colors.textDim}>{idx + 1}</text>
                </box>
                <box width={tickerWidth} flexShrink={0}>
                  <text fg={isSelected ? colors.selectedText : colors.textBright} attributes={TextAttributes.BOLD}>
                    {q.symbol}
                  </text>
                </box>
                <box width={nameWidth} flexShrink={1} overflow="hidden">
                  <text fg={fg}>{q.name}</text>
                </box>
                <box width={priceWidth} justifyContent="flex-end" paddingRight={1}>
                  <text fg={fg}>{formatCurrency(q.price, q.currency)}</text>
                </box>
                <box width={chgWidth} justifyContent="flex-end" paddingRight={1}>
                  <text fg={chgColor}>
                    {formatPercentRaw(q.changePercent)}
                  </text>
                </box>
                {!compact && (
                  <>
                    <box width={volWidth} justifyContent="flex-end" paddingRight={1}>
                      <text fg={isSelected ? colors.selectedText : colors.textDim}>
                        {formatCompact(q.volume)}
                      </text>
                    </box>
                    <box width={volRatioWidth} justifyContent="flex-end" paddingRight={1}>
                      <text fg={isSelected ? colors.selectedText : volRatioColor(q.volumeRatio)}>
                        {formatVolRatio(q.volumeRatio)}
                      </text>
                    </box>
                    <box width={rangeWidth} justifyContent="flex-end" paddingRight={1}>
                      <text fg={isSelected ? colors.selectedText : colors.textDim}>
                        {fiftyTwoWeekPosition(q.price, q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh)}
                      </text>
                    </box>
                    <box width={mcapWidth} justifyContent="flex-end">
                      <text fg={isSelected ? colors.selectedText : colors.textDim}>
                        {q.marketCap != null ? formatCompact(q.marketCap) : "—"}
                      </text>
                    </box>
                  </>
                )}
              </box>
            );
          })}

          {!loading && quotes.length === 0 && (
            <box paddingX={1} paddingY={1}>
              <text fg={colors.textMuted}>No data</text>
            </box>
          )}
        </box>
      </scrollbox>

      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>←/→ tabs · ↑/↓ navigate · Enter open · [r]efresh</text>
      </box>
    </box>
  );
}

export const marketMoversPlugin: GloomPlugin = {
  id: "market-movers",
  name: "Market Movers",
  version: "1.0.0",
  description: "Top gainers, losers, most active, and trending tickers",
  toggleable: true,

  panes: [
    {
      id: "market-movers",
      name: "Market Movers",
      icon: "T",
      component: MarketMoversPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 100, height: 36 },
    },
  ],

  paneTemplates: [
    {
      id: "market-movers-pane",
      paneId: "market-movers",
      label: "Market Movers",
      description: "Top gainers, losers, most active, and trending tickers.",
      keywords: ["movers", "gainers", "losers", "active", "trending", "screener", "top"],
      shortcut: { prefix: "TOP" },
    },
  ],
};
