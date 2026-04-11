import { useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { colors, priceColor } from "../../../theme/colors";
import { formatCurrency, formatCompact, formatPercent, formatNumber } from "../../../utils/format";
import { useAppSelector, getFocusedCollectionId } from "../../../state/app-context";
import { getCollectionTickers } from "../../../state/selectors";
import { useChartQueries, useTickerFinancialsMap } from "../../../market-data/hooks";
import { buildChartKey } from "../../../market-data/selectors";
import { getSharedDataProvider } from "../../registry";
import { computeReturns } from "../correlation/compute";
import { computeSharpeRatio, computeBeta, computeSectorAllocation, type SectorAllocation } from "./metrics";

function sharpeColor(sharpe: number): string {
  if (sharpe > 1) return colors.positive;
  if (sharpe < 0) return colors.negative;
  return colors.textDim;
}

function sharpeLabel(sharpe: number): string {
  if (sharpe > 1) return "good";
  if (sharpe >= 0) return "okay";
  return "poor";
}

function betaLabel(beta: number): string {
  if (beta > 1.2) return "high vol";
  if (beta >= 0.8) return "market";
  return "defensive";
}

function betaColor(beta: number): string {
  if (beta > 1.2) return colors.negative;
  if (beta >= 0.8) return colors.textMuted ?? colors.text;
  return colors.positive;
}

function renderBar(weight: number, maxWidth: number): string {
  const filled = Math.round(weight * maxWidth);
  return "█".repeat(Math.min(filled, maxWidth));
}

export function PortfolioAnalyticsPane({ focused, width, height, close }: PaneProps) {
  const state = useAppSelector((s) => s);
  const collectionId = getFocusedCollectionId(state);
  const portfolios = state.config.portfolios;

  const portfolioTickers = useMemo(() => {
    if (collectionId) {
      return getCollectionTickers(state, collectionId);
    }
    return [...state.tickers.values()].filter((t) => t.metadata.portfolios.length > 0);
  }, [state.tickers, collectionId]);

  const collectionName = useMemo(() => {
    if (collectionId) {
      const portfolio = portfolios.find((p) => p.id === collectionId);
      if (portfolio) return portfolio.name;
      const watchlist = state.config.watchlists.find((w) => w.id === collectionId);
      if (watchlist) return watchlist.name;
    }
    return portfolios[0]?.name ?? "Portfolio";
  }, [collectionId, portfolios, state.config.watchlists]);

  // Chart requests for portfolio tickers
  const chartRequests = useMemo(
    () =>
      portfolioTickers.map((ticker) => ({
        instrument: {
          symbol: ticker.metadata.ticker,
          exchange: ticker.metadata.exchange ?? "",
        },
        bufferRange: "1Y" as const,
        granularity: "range" as const,
      })),
    [portfolioTickers.map((t) => t.metadata.ticker).join(",")],
  );

  const chartEntries = useChartQueries(chartRequests);

  // SPY data for beta
  const spyRequest = useMemo(
    () => ({
      instrument: { symbol: "SPY", exchange: "" },
      bufferRange: "1Y" as const,
      granularity: "range" as const,
    }),
    [],
  );
  const spyChartRequests = useMemo(() => [spyRequest], [spyRequest]);
  const spyChartEntries = useChartQueries(spyChartRequests);

  // Actively fetch financials (includes profile with sector data)
  const financials = useTickerFinancialsMap(portfolioTickers);

  // Compute portfolio metrics
  const portfolioStats = useMemo(() => {
    let totalValue = 0;
    let totalDayPnl = 0;
    let totalUnrealizedPnl = 0;

    for (const ticker of portfolioTickers) {
      const fin = financials.get(ticker.metadata.ticker);
      const quote = fin?.quote;

      for (const pos of ticker.metadata.positions) {
        const shares = pos.shares;
        const price = quote?.price ?? pos.markPrice ?? pos.avgCost;
        const mv = pos.marketValue ?? shares * price;
        totalValue += mv;

        if (quote?.change != null) {
          totalDayPnl += quote.change * shares;
        }

        const unrealized = pos.unrealizedPnl ?? (mv - shares * pos.avgCost);
        totalUnrealizedPnl += unrealized;
      }
    }

    return { totalValue, totalDayPnl, totalUnrealizedPnl };
  }, [portfolioTickers, financials]);

  // Compute equal-weighted portfolio returns
  const portfolioReturns = useMemo(() => {
    const allReturns: number[][] = [];
    for (let i = 0; i < portfolioTickers.length; i++) {
      const request = chartRequests[i]!;
      const key = buildChartKey(request);
      const entry = chartEntries.get(key);
      const history = entry?.data ?? entry?.lastGoodData ?? null;
      if (!history || history.length < 11) continue;
      const closes = history.map((p) => p.close);
      allReturns.push(computeReturns(closes));
    }
    if (allReturns.length === 0) return null;
    const n = Math.min(...allReturns.map((r) => r.length));
    const combined: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const r of allReturns) sum += r[i]!;
      combined.push(sum / allReturns.length);
    }
    return combined;
  }, [chartEntries, portfolioTickers, chartRequests]);

  // SPY returns for beta
  const spyReturns = useMemo(() => {
    const spyKey = buildChartKey(spyRequest);
    const entry = spyChartEntries.get(spyKey);
    const history = entry?.data ?? entry?.lastGoodData ?? null;
    if (!history || history.length < 11) return null;
    return computeReturns(history.map((p) => p.close));
  }, [spyChartEntries, spyRequest]);

  const sharpe = useMemo(
    () => (portfolioReturns ? computeSharpeRatio(portfolioReturns) : null),
    [portfolioReturns],
  );

  const beta = useMemo(
    () => (portfolioReturns && spyReturns ? computeBeta(portfolioReturns, spyReturns) : null),
    [portfolioReturns, spyReturns],
  );

  // Sector allocation
  const sectorAllocation = useMemo(() => {
    const positions: Array<{ sector: string; marketValue: number }> = [];
    for (const ticker of portfolioTickers) {
      const fin = financials.get(ticker.metadata.ticker);
      const sector =
        ticker.metadata.sector ||
        fin?.profile?.sector ||
        "";

      let mv = 0;
      for (const pos of ticker.metadata.positions) {
        const price = fin?.quote?.price ?? pos.markPrice ?? pos.avgCost;
        mv += pos.marketValue ?? pos.shares * price;
      }
      if (mv > 0) {
        positions.push({ sector, marketValue: mv });
      }
    }
    return computeSectorAllocation(positions);
  }, [portfolioTickers, financials]);

  const scrollRef = useRef<ScrollBoxRenderable>(null);

  useKeyboard((event) => {
    if (!focused) return;
    if (event.name === "escape") {
      close?.();
      return;
    }
    if (event.name === "j") {
      scrollRef.current?.scrollBy(0, 1);
    } else if (event.name === "k") {
      scrollRef.current?.scrollBy(0, -1);
    }
  });

  const hasPositions = portfolioTickers.length > 0;
  const labelWidth = 14;
  const valueWidth = 14;
  const barMaxWidth = Math.max(10, width - 32);
  const sectorLabelWidth = Math.min(20, Math.floor(width * 0.35));
  const sectorValueWidth = 8;
  const sectorBarWidth = Math.max(8, width - sectorLabelWidth - sectorValueWidth - 6);

  const headerBg = colors.surface ?? colors.bg;

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Title row */}
      <box
        flexDirection="row"
        height={1}
        paddingX={1}
        backgroundColor={headerBg}
      >
        <text fg={colors.textMuted}>{collectionName}</text>
      </box>

      <scrollbox ref={scrollRef} flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column" paddingX={1} paddingY={1}>
          {!hasPositions ? (
            <box paddingTop={1}>
              <text fg={colors.textMuted}>No portfolio positions found</text>
            </box>
          ) : (
            <>
              {/* Summary stats */}
              <box height={1}>
                <text fg={colors.textDim} attributes={TextAttributes.BOLD}>
                  Summary
                </text>
              </box>

              <box flexDirection="row" height={1}>
                <box width={labelWidth} flexShrink={0}>
                  <text fg={colors.textDim}>Total Value</text>
                </box>
                <text fg={colors.text} attributes={TextAttributes.BOLD}>
                  {formatCurrency(portfolioStats.totalValue)}
                </text>
              </box>

              <box flexDirection="row" height={1}>
                <box width={labelWidth} flexShrink={0}>
                  <text fg={colors.textDim}>Day P&L</text>
                </box>
                <text
                  fg={priceColor(portfolioStats.totalDayPnl)}
                  attributes={TextAttributes.BOLD}
                >
                  {portfolioStats.totalDayPnl >= 0 ? "+" : ""}
                  {formatCurrency(portfolioStats.totalDayPnl)}
                </text>
              </box>

              <box flexDirection="row" height={1}>
                <box width={labelWidth} flexShrink={0}>
                  <text fg={colors.textDim}>Total Return</text>
                </box>
                <text
                  fg={priceColor(portfolioStats.totalUnrealizedPnl)}
                  attributes={TextAttributes.BOLD}
                >
                  {portfolioStats.totalUnrealizedPnl >= 0 ? "+" : ""}
                  {formatCurrency(portfolioStats.totalUnrealizedPnl)}
                </text>
              </box>

              {/* Divider */}
              <box height={1} paddingTop={1}>
                <text fg={colors.borderDim ?? colors.border}>{"─".repeat(Math.max(0, width - 2))}</text>
              </box>

              {/* Sharpe Ratio */}
              <box height={1}>
                <text fg={colors.textDim} attributes={TextAttributes.BOLD}>
                  Risk / Return
                </text>
              </box>

              <box flexDirection="row" height={1}>
                <box width={labelWidth} flexShrink={0}>
                  <text fg={colors.textDim}>Sharpe Ratio</text>
                </box>
                {sharpe !== null ? (
                  <box flexDirection="row">
                    <text fg={sharpeColor(sharpe)} attributes={TextAttributes.BOLD}>
                      {formatNumber(sharpe, 2)}
                    </text>
                    <text fg={colors.textDim}>{`  ${sharpeLabel(sharpe)}`}</text>
                  </box>
                ) : (
                  <text fg={colors.textMuted}>— insufficient data</text>
                )}
              </box>

              <box flexDirection="row" height={1}>
                <box width={labelWidth} flexShrink={0}>
                  <text fg={colors.textDim}>Beta (SPY)</text>
                </box>
                {beta !== null ? (
                  <box flexDirection="row">
                    <text fg={betaColor(beta)} attributes={TextAttributes.BOLD}>
                      {formatNumber(beta, 2)}
                    </text>
                    <text fg={colors.textDim}>{`  ${betaLabel(beta)}`}</text>
                  </box>
                ) : (
                  <text fg={colors.textMuted}>— insufficient data</text>
                )}
              </box>

              {/* Divider */}
              <box height={1} paddingTop={1}>
                <text fg={colors.borderDim ?? colors.border}>{"─".repeat(Math.max(0, width - 2))}</text>
              </box>

              {/* Sector Allocation */}
              <box height={1}>
                <text fg={colors.textDim} attributes={TextAttributes.BOLD}>
                  Sector Allocation
                </text>
              </box>

              {sectorAllocation.length === 0 ? (
                <box paddingTop={0}>
                  <text fg={colors.textMuted}>No sector data available</text>
                </box>
              ) : (
                <box flexDirection="column">
                  {sectorAllocation.map((alloc) => (
                    <box key={alloc.sector} flexDirection="row" height={1}>
                      <box width={sectorLabelWidth} flexShrink={0} overflow="hidden">
                        <text fg={colors.text}>
                          {alloc.sector.slice(0, sectorLabelWidth - 1)}
                        </text>
                      </box>
                      <box width={sectorValueWidth} flexShrink={0} justifyContent="flex-end">
                        <text fg={colors.textDim}>
                          {(alloc.weight * 100).toFixed(1)}%
                        </text>
                      </box>
                      <box flexGrow={1} paddingLeft={1}>
                        <text fg={colors.textMuted}>
                          {renderBar(alloc.weight, sectorBarWidth)}
                        </text>
                      </box>
                    </box>
                  ))}
                </box>
              )}

              <box height={1} paddingTop={1} />
            </>
          )}
        </box>
      </scrollbox>

      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>j/k scroll  Esc close</text>
      </box>
    </box>
  );
}

export const analyticsPlugin: GloomPlugin = {
  id: "analytics",
  name: "Portfolio Analytics",
  version: "1.0.0",
  description: "Sharpe ratio, beta, and sector allocation for the active portfolio",
  toggleable: true,

  panes: [
    {
      id: "analytics",
      name: "Portfolio Analytics",
      icon: "R",
      component: PortfolioAnalyticsPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 80, height: 30 },
    },
  ],

  paneTemplates: [
    {
      id: "analytics-pane",
      paneId: "analytics",
      label: "Portfolio Analytics",
      description: "Sharpe ratio, beta vs S&P 500, and sector allocation for your portfolio.",
      keywords: ["risk", "analytics", "sharpe", "beta", "sector", "allocation", "portfolio"],
      shortcut: { prefix: "PORT" },
    },
  ],
};
