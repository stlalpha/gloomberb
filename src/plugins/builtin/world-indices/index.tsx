import { useEffect, useRef, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import type { Quote } from "../../../types/financials";
import type { MarketState } from "../../../types/financials";
import { colors, hoverBg, priceColor } from "../../../theme/colors";
import { formatCurrency, formatPercentRaw } from "../../../utils/format";
import { getSharedDataProvider, getSharedRegistry } from "../../registry";
import { WORLD_INDICES, REGION_LABELS, REGION_ORDER, getIndicesByRegion, type IndexEntry } from "./indices";

const REFRESH_INTERVAL_MS = 60_000;

interface IndexQuoteState {
  quote: Quote | null;
  loading: boolean;
  error: string | null;
}

type QuoteMap = Map<string, IndexQuoteState>;

function marketStatusDot(state: MarketState | undefined): { char: string; color: string } {
  switch (state) {
    case "REGULAR":
      return { char: "●", color: colors.positive };
    case "PRE":
    case "POST":
    case "PREPRE":
    case "POSTPOST":
      return { char: "●", color: colors.warning };
    case "CLOSED":
    default:
      return { char: "●", color: colors.negative };
  }
}

function buildFlatRows(indicesByRegion: Map<IndexEntry["region"], IndexEntry[]>): Array<{ type: "header"; region: IndexEntry["region"] } | { type: "row"; entry: IndexEntry }> {
  const rows: Array<{ type: "header"; region: IndexEntry["region"] } | { type: "row"; entry: IndexEntry }> = [];
  for (const region of REGION_ORDER) {
    const entries = indicesByRegion.get(region) ?? [];
    if (entries.length === 0) continue;
    rows.push({ type: "header", region });
    for (const entry of entries) {
      rows.push({ type: "row", entry });
    }
  }
  return rows;
}

// Returns only the row-type indices (for navigation purposes)
function rowIndicesOf(flatRows: ReturnType<typeof buildFlatRows>): number[] {
  return flatRows.reduce<number[]>((acc, row, i) => {
    if (row.type === "row") acc.push(i);
    return acc;
  }, []);
}

export function WorldIndicesPane({ focused, width, height }: PaneProps) {
  const registry = getSharedRegistry();
  const [quotes, setQuotes] = useState<QuoteMap>(new Map());
  const [selectedFlatIdx, setSelectedFlatIdx] = useState<number>(-1);
  const [hoveredFlatIdx, setHoveredFlatIdx] = useState<number | null>(null);
  const fetchGenRef = useRef(0);

  const indicesByRegion = getIndicesByRegion();
  const flatRows = buildFlatRows(indicesByRegion);
  const navigableIndices = rowIndicesOf(flatRows);

  // Initialize selection to first navigable row
  useEffect(() => {
    if (selectedFlatIdx === -1 && navigableIndices.length > 0) {
      setSelectedFlatIdx(navigableIndices[0]!);
    }
  }, []);

  const fetchAll = () => {
    const provider = getSharedDataProvider();
    if (!provider) return;

    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;

    for (const entry of WORLD_INDICES) {
      setQuotes((prev) => {
        const next = new Map(prev);
        const existing = next.get(entry.symbol);
        next.set(entry.symbol, { quote: existing?.quote ?? null, loading: true, error: null });
        return next;
      });

      provider.getQuote(entry.symbol, "").then((quote) => {
        if (fetchGenRef.current !== gen) return;
        setQuotes((prev) => {
          const next = new Map(prev);
          next.set(entry.symbol, { quote, loading: false, error: null });
          return next;
        });
      }).catch((err: unknown) => {
        if (fetchGenRef.current !== gen) return;
        const msg = err instanceof Error ? err.message : String(err);
        setQuotes((prev) => {
          const next = new Map(prev);
          next.set(entry.symbol, { quote: null, loading: false, error: msg });
          return next;
        });
      });
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const openSelected = (flatIdx: number) => {
    const row = flatRows[flatIdx];
    if (!row || row.type !== "row") return;
    registry?.navigateTickerFn(row.entry.symbol);
  };

  useKeyboard((event) => {
    if (!focused) return;

    const currentPos = navigableIndices.indexOf(selectedFlatIdx);

    if (event.name === "j" || event.name === "down") {
      const next = navigableIndices[currentPos + 1];
      if (next !== undefined) setSelectedFlatIdx(next);
    } else if (event.name === "k" || event.name === "up") {
      const next = navigableIndices[currentPos - 1];
      if (next !== undefined) setSelectedFlatIdx(next);
    } else if (event.name === "return") {
      openSelected(selectedFlatIdx);
    }
  });

  const shortNameWidth = 8;
  const priceWidth = 16;
  const changeWidth = 10;
  const dotWidth = 2;
  const minNameWidth = 10;
  const nameWidth = Math.max(minNameWidth, width - shortNameWidth - priceWidth - changeWidth - dotWidth - 4);

  return (
    <box flexDirection="column" width={width} height={height}>
      <scrollbox flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {flatRows.map((row, flatIdx) => {
            if (row.type === "header") {
              return (
                <box key={`header-${row.region}`} flexDirection="row" paddingX={1} paddingTop={flatIdx === 0 ? 0 : 1}>
                  <text fg={colors.textBright} attributes={TextAttributes.BOLD}>
                    {REGION_LABELS[row.region]}
                  </text>
                </box>
              );
            }

            const { entry } = row;
            const state = quotes.get(entry.symbol);
            const quote = state?.quote;
            const isSelected = flatIdx === selectedFlatIdx;
            const isHovered = flatIdx === hoveredFlatIdx;
            const bg = isSelected ? colors.selected : isHovered ? hoverBg() : undefined;
            const fg = isSelected ? colors.selectedText : colors.text;
            const dot = marketStatusDot(quote?.marketState);
            const changePercent = quote?.changePercent;
            const price = quote?.price;

            return (
              <box
                key={entry.symbol}
                flexDirection="row"
                width={width}
                backgroundColor={bg}
                onMouseMove={() => setHoveredFlatIdx(flatIdx)}
                onMouseOut={() => setHoveredFlatIdx(null)}
                onMouseDown={(event: any) => {
                  event.preventDefault?.();
                  if (selectedFlatIdx === flatIdx) {
                    openSelected(flatIdx);
                  } else {
                    setSelectedFlatIdx(flatIdx);
                  }
                }}
              >
                <box width={dotWidth} paddingLeft={1}>
                  <text fg={dot.color}>{dot.char}</text>
                </box>
                <box width={shortNameWidth} flexShrink={0}>
                  <text fg={isSelected ? colors.selectedText : colors.textBright} attributes={TextAttributes.BOLD}>
                    {entry.shortName}
                  </text>
                </box>
                <box width={nameWidth} flexShrink={1} overflow="hidden">
                  <text fg={fg}>{entry.name}</text>
                </box>
                <box width={priceWidth} justifyContent="flex-end" paddingRight={1}>
                  {state?.loading && !quote ? (
                    <text fg={colors.textDim}>…</text>
                  ) : state?.error ? (
                    <text fg={colors.textDim}>—</text>
                  ) : (
                    <text fg={fg}>
                      {price !== undefined ? formatCurrency(price, quote?.currency ?? "USD") : "—"}
                    </text>
                  )}
                </box>
                <box width={changeWidth} justifyContent="flex-end" paddingRight={1}>
                  {quote && changePercent !== undefined ? (
                    <text fg={isSelected ? colors.selectedText : priceColor(changePercent)}>
                      {formatPercentRaw(changePercent)}
                    </text>
                  ) : (
                    <text fg={colors.textDim}>—</text>
                  )}
                </box>
              </box>
            );
          })}
        </box>
      </scrollbox>

      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>j/k navigate · Enter opens ticker</text>
      </box>
    </box>
  );
}

export const worldIndicesPlugin: GloomPlugin = {
  id: "world-indices",
  name: "World Equity Indices",
  version: "1.0.0",
  description: "Global equity index monitor grouped by region",
  toggleable: true,

  panes: [
    {
      id: "world-indices",
      name: "World Indices",
      icon: "W",
      component: WorldIndicesPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 72, height: 32 },
    },
  ],

  paneTemplates: [
    {
      id: "world-indices-pane",
      paneId: "world-indices",
      label: "World Equity Indices",
      description: "Monitor global equity indices grouped by region.",
      keywords: ["world", "indices", "global", "equity", "markets", "international"],
      shortcut: { prefix: "WEI" },
    },
  ],
};
