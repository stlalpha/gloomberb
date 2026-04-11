import { useEffect, useRef, useState } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { colors, hoverBg, priceColor } from "../../../theme/colors";
import { formatCurrency, formatPercentRaw } from "../../../utils/format";
import { getSharedDataProvider, getSharedRegistry } from "../../registry";
import { SECTORS, type SectorDef } from "./sector-data";

const REFRESH_INTERVAL_MS = 60_000;

interface SectorRow extends SectorDef {
  price: number | null;
  changePercent: number | null;
  currency: string;
  loading: boolean;
}

function buildBar(changePercent: number, barWidth: number): string {
  if (barWidth <= 0) return "";
  const filled = Math.round(Math.abs(changePercent) / 5 * barWidth);
  const clamped = Math.min(filled, barWidth);
  return "━".repeat(clamped);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SectorPerformancePane({ focused, width, height, close }: PaneProps) {
  const registry = getSharedRegistry();

  const [rows, setRows] = useState<SectorRow[]>(
    SECTORS.map((s) => ({ ...s, price: null, changePercent: null, currency: "USD", loading: true })),
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchGenRef = useRef(0);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const fetchAll = () => {
    fetchGenRef.current += 1;
    const gen = fetchGenRef.current;
    const provider = getSharedDataProvider();
    if (!provider) return;

    setRows((prev) => prev.map((r) => ({ ...r, loading: true })));

    const fetches = SECTORS.map(async (sector) => {
      try {
        const q = await provider.getQuote(sector.etf, "");
        if (fetchGenRef.current !== gen) return;
        setRows((prev) =>
          prev.map((r) =>
            r.etf === sector.etf
              ? {
                  ...r,
                  price: q?.price ?? null,
                  changePercent: q?.changePercent ?? null,
                  currency: q?.currency ?? "USD",
                  loading: false,
                }
              : r,
          ),
        );
      } catch {
        if (fetchGenRef.current !== gen) return;
        setRows((prev) =>
          prev.map((r) =>
            r.etf === sector.etf ? { ...r, loading: false } : r,
          ),
        );
      }
    });

    Promise.allSettled(fetches).then(() => {
      if (fetchGenRef.current === gen) {
        setLastRefresh(new Date());
      }
    });
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Sort rows by changePercent descending (best at top), nulls at bottom
  const sortedRows = [...rows].sort((a, b) => {
    if (a.changePercent === null && b.changePercent === null) return 0;
    if (a.changePercent === null) return 1;
    if (b.changePercent === null) return -1;
    return b.changePercent - a.changePercent;
  });

  const openSelected = (idx: number) => {
    const row = sortedRows[idx];
    if (!row) return;
    registry?.navigateTickerFn(row.etf);
  };

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "j" || event.name === "down") {
      setSelectedIdx((prev) => Math.min(prev + 1, sortedRows.length - 1));
    } else if (event.name === "k" || event.name === "up") {
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (event.name === "return") {
      openSelected(selectedIdx);
    } else if (event.name === "r") {
      fetchAll();
    } else if (event.name === "escape") {
      close?.();
    }
  });

  // Scroll to keep selected row visible
  useEffect(() => {
    const sb = scrollRef.current;
    if (!sb?.viewport || sortedRows.length === 0 || selectedIdx < 0) return;
    const viewportHeight = Math.max(sb.viewport.height, 1);
    if (selectedIdx < sb.scrollTop) {
      sb.scrollTo(selectedIdx);
    } else if (selectedIdx >= sb.scrollTop + viewportHeight) {
      sb.scrollTo(selectedIdx - viewportHeight + 1);
    }
  }, [selectedIdx, sortedRows.length]);

  // Fixed column widths
  const nameWidth = 16;
  const etfWidth = 5;
  const priceWidth = 10;
  const chgWidth = 8;
  const fixedCols = nameWidth + etfWidth + priceWidth + chgWidth + 4; // 4 for padding
  const barMaxWidth = Math.max(0, width - fixedCols - 2);

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <box flexDirection="row" height={1} paddingX={1}>
        {lastRefresh && (
          <text fg={colors.textMuted}>{formatTime(lastRefresh)}</text>
        )}
      </box>

      {/* Rows */}
      <scrollbox ref={scrollRef} flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {sortedRows.map((row, idx) => {
            const isSelected = idx === selectedIdx;
            const isHovered = idx === hoveredIdx;
            const bg = isSelected ? colors.selected : isHovered ? hoverBg() : undefined;
            const fg = isSelected ? colors.selectedText : colors.text;
            const chgPct = row.changePercent;
            const chgColor = isSelected ? colors.selectedText : chgPct !== null ? priceColor(chgPct) : colors.textDim;
            const barColor = chgPct !== null && chgPct >= 0 ? colors.positive : colors.negative;
            const bar = chgPct !== null ? buildBar(chgPct, barMaxWidth) : "";

            return (
              <box
                key={row.etf}
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
                onDoubleClick={(event: any) => {
                  event.preventDefault?.();
                  openSelected(idx);
                }}
              >
                <box width={nameWidth} flexShrink={0} overflow="hidden">
                  <text fg={fg}>{row.name}</text>
                </box>
                <box width={etfWidth} flexShrink={0}>
                  <text fg={isSelected ? colors.selectedText : colors.textDim}>{row.etf}</text>
                </box>
                <box width={priceWidth} justifyContent="flex-end" paddingRight={1}>
                  {row.loading && row.price === null ? (
                    <text fg={colors.textDim}>…</text>
                  ) : row.price !== null ? (
                    <text fg={fg}>{formatCurrency(row.price, row.currency)}</text>
                  ) : (
                    <text fg={colors.textDim}>—</text>
                  )}
                </box>
                <box width={chgWidth} justifyContent="flex-end" paddingRight={1}>
                  {chgPct !== null ? (
                    <text fg={chgColor}>{formatPercentRaw(chgPct)}</text>
                  ) : (
                    <text fg={colors.textDim}>—</text>
                  )}
                </box>
                {bar.length > 0 && (
                  <text fg={isSelected ? colors.selectedText : barColor}>{bar}</text>
                )}
              </box>
            );
          })}
        </box>
      </scrollbox>

      {/* Footer */}
      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>j/k navigate · Enter open · [r]efresh · Esc close</text>
      </box>
    </box>
  );
}

export const sectorsPlugin: GloomPlugin = {
  id: "sectors",
  name: "Sector Performance",
  version: "1.0.0",
  description: "S&P 500 sector performance via sector ETF proxies",
  toggleable: true,

  panes: [
    {
      id: "sectors",
      name: "Sector Performance",
      icon: "S",
      component: SectorPerformancePane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 75, height: 16 },
    },
  ],

  paneTemplates: [
    {
      id: "sectors-pane",
      paneId: "sectors",
      label: "Sector Performance",
      description: "S&P 500 sector performance sorted by daily change.",
      keywords: ["sector", "sectors", "etf", "xlk", "xlv", "xlf", "performance", "spdr"],
      shortcut: { prefix: "BI" },
    },
  ],
};
