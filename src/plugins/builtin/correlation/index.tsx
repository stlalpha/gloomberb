import { useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { colors } from "../../../theme/colors";
import { getSharedRegistry } from "../../registry";
import { useAppSelector, getFocusedCollectionId } from "../../../state/app-context";
import { getCollectionTickers } from "../../../state/selectors";
import { useChartQueries } from "../../../market-data/hooks";
import { buildChartKey } from "../../../market-data/selectors";
import { computeReturns, pearsonCorrelation, formatCorrelation, correlationColor } from "./compute";

const MAX_TICKERS = 12;
const ROW_HEADER_WIDTH = 7;

export function CorrelationMatrixPane({ focused, width, height, close }: PaneProps) {
  const state = useAppSelector((s) => s);
  const collectionId = getFocusedCollectionId(state);

  const tickers = useMemo(() => {
    // Use the active collection's tickers, fall back to all portfolio/watchlist tickers
    if (collectionId) {
      return getCollectionTickers(state, collectionId).slice(0, MAX_TICKERS);
    }
    const all = [...state.tickers.values()].filter(
      (t) => t.metadata.portfolios.length > 0 || t.metadata.watchlists.length > 0,
    );
    return all.slice(0, MAX_TICKERS);
  }, [state.tickers, collectionId]);

  const chartRequests = useMemo(
    () => tickers.map((ticker) => ({
      instrument: {
        symbol: ticker.metadata.ticker,
        exchange: ticker.metadata.exchange ?? "",
      },
      bufferRange: "1Y" as const,
      granularity: "range" as const,
    })),
    [tickers.map((t) => t.metadata.ticker).join(",")],
  );

  const chartEntries = useChartQueries(chartRequests);

  const returnsMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i]!;
      const request = chartRequests[i]!;
      const symbol = ticker.metadata.ticker;
      const key = buildChartKey(request);
      const entry = chartEntries.get(key);
      const priceHistory = entry?.data ?? entry?.lastGoodData ?? null;
      if (!priceHistory || priceHistory.length < 6) continue;
      const closes = priceHistory.map((p) => p.close);
      map.set(symbol, computeReturns(closes));
    }
    return map;
  }, [chartEntries, tickers]);

  const symbols = tickers.map((t) => t.metadata.ticker);

  useKeyboard((event) => {
    if (!focused) return;
    if (event.name === "escape") {
      close?.();
    }
  });

  if (symbols.length < 2) {
    return (
      <box flexDirection="column" width={width} height={height} paddingX={2} paddingY={1}>
        <text fg={colors.textMuted}>Need at least 2 tickers in portfolios/watchlists</text>
      </box>
    );
  }

  const headerBg = colors.surface ?? colors.bg;

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Title */}
      <box flexDirection="row" height={1} paddingX={1}>
        <text fg={colors.textMuted}>{symbols.length} tickers · 1Y daily returns</text>
      </box>

      {/* Column header row */}
      <box flexDirection="row" paddingX={1} height={1} backgroundColor={headerBg}>
        <box width={ROW_HEADER_WIDTH} flexShrink={0} />
        {symbols.map((sym) => (
          <box key={sym} flexGrow={1} justifyContent="flex-end" paddingRight={1} overflow="hidden">
            <text fg={colors.textDim} attributes={TextAttributes.BOLD}>
              {sym.length > 5 ? sym.slice(0, 5) : sym}
            </text>
          </box>
        ))}
      </box>

      {/* Matrix rows */}
      <scrollbox flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {symbols.map((rowSym) => (
            <box key={rowSym} flexDirection="row" paddingX={1}>
              {/* Row header */}
              <box
                width={ROW_HEADER_WIDTH}
                flexShrink={0}
                overflow="hidden"
                onMouseDown={() => getSharedRegistry()?.navigateTickerFn(rowSym)}
              >
                <text fg={colors.textBright} attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}>
                  {rowSym.length > 5 ? rowSym.slice(0, 5) : rowSym}
                </text>
              </box>
              {/* Cells */}
              {symbols.map((colSym) => {
                const isDiag = rowSym === colSym;
                let r: number | null = null;
                if (isDiag) {
                  r = 1;
                } else {
                  const rx = returnsMap.get(rowSym);
                  const ry = returnsMap.get(colSym);
                  if (rx && ry) {
                    r = pearsonCorrelation(rx, ry);
                  }
                }
                const cellColor = isDiag
                  ? colors.textDim
                  : correlationColor(r, colors.positive, colors.negative, colors.textMuted);
                const text = isDiag ? " 1.00" : formatCorrelation(r);
                return (
                  <box key={colSym} flexGrow={1} justifyContent="flex-end" paddingRight={1}>
                    <text fg={cellColor}>{text}</text>
                  </box>
                );
              })}
            </box>
          ))}
        </box>
      </scrollbox>

      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>Esc close</text>
      </box>
    </box>
  );
}

export const correlationPlugin: GloomPlugin = {
  id: "correlation",
  name: "Correlation Matrix",
  version: "1.0.0",
  description: "NxN Pearson correlation matrix for tickers in portfolios/watchlists",
  toggleable: true,

  panes: [
    {
      id: "correlation",
      name: "Correlation Matrix",
      icon: "C",
      component: CorrelationMatrixPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 90, height: 18 },
    },
  ],

  paneTemplates: [
    {
      id: "correlation-pane",
      paneId: "correlation",
      label: "Correlation Matrix",
      description: "NxN Pearson correlation matrix for tickers in portfolios/watchlists.",
      keywords: ["correlation", "corr", "matrix", "pearson", "returns", "covariance"],
      shortcut: { prefix: "CORR" },
    },
  ],
};
