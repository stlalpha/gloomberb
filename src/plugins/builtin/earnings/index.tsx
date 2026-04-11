import { useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import type { EarningsEvent } from "../../../types/data-provider";
import { colors, hoverBg } from "../../../theme/colors";
import { getSharedDataProvider } from "../../registry";
import { getSharedRegistry } from "../../registry";
import { useAppSelector, getFocusedCollectionId } from "../../../state/app-context";
import { getCollectionTickers } from "../../../state/selectors";
import { formatCompact } from "../../../utils/format";

const CACHE_TTL_MS = 30 * 60 * 1000;

let sharedCache: { data: EarningsEvent[]; fetchedAt: number } | null = null;
let activeFetch: Promise<EarningsEvent[]> | null = null;

async function loadEarnings(symbols: string[], force = false): Promise<EarningsEvent[]> {
  if (!force && sharedCache && Date.now() - sharedCache.fetchedAt < CACHE_TTL_MS) {
    return sharedCache.data;
  }
  if (activeFetch) return activeFetch;

  const provider = getSharedDataProvider();
  if (!provider?.getEarningsCalendar) return [];

  activeFetch = provider
    .getEarningsCalendar(symbols)
    .then((data) => {
      sharedCache = { data, fetchedAt: Date.now() };
      activeFetch = null;
      return data;
    })
    .catch((err) => {
      activeFetch = null;
      throw err;
    });
  return activeFetch;
}

type DisplayRow =
  | { kind: "separator"; label: string }
  | { kind: "event"; event: EarningsEvent; eventIdx: number };

function groupByRelativeDate(events: EarningsEvent[]): DisplayRow[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  // End of this week (Sunday)
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  // End of next week
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  const groups: { label: string; events: EarningsEvent[] }[] = [
    { label: "TODAY", events: [] },
    { label: "TOMORROW", events: [] },
    { label: "THIS WEEK", events: [] },
    { label: "NEXT WEEK", events: [] },
    { label: "LATER", events: [] },
  ];

  for (const ev of events) {
    const d = ev.earningsDate;
    if (d >= today && d < tomorrow) {
      groups[0]!.events.push(ev);
    } else if (d >= tomorrow && d < dayAfterTomorrow) {
      groups[1]!.events.push(ev);
    } else if (d >= dayAfterTomorrow && d < endOfWeek) {
      groups[2]!.events.push(ev);
    } else if (d >= endOfWeek && d < endOfNextWeek) {
      groups[3]!.events.push(ev);
    } else if (d >= endOfNextWeek) {
      groups[4]!.events.push(ev);
    }
  }

  const rows: DisplayRow[] = [];
  let eventIdx = 0;
  for (const group of groups) {
    if (group.events.length === 0) continue;
    rows.push({ kind: "separator", label: `${group.label} (${group.events.length})` });
    for (const event of group.events) {
      rows.push({ kind: "event", event, eventIdx });
      eventIdx++;
    }
  }
  return rows;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function EarningsCalendarPane({ focused, width, height, close }: PaneProps) {
  const [events, setEvents] = useState<EarningsEvent[]>(sharedCache?.data ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const state = useAppSelector((s) => s);
  const collectionId = getFocusedCollectionId(state);
  const tickerSymbols = useMemo(() => {
    if (collectionId) {
      return getCollectionTickers(state, collectionId).map((t) => t.metadata.ticker);
    }
    return [...state.tickers.values()].map((t) => t.metadata.ticker);
  }, [state.tickers, collectionId]);

  useEffect(() => {
    if (tickerSymbols.length === 0) return;
    if (sharedCache && Date.now() - sharedCache.fetchedAt < CACHE_TTL_MS) {
      setEvents(sharedCache.data);
      return;
    }
    setLoading(true);
    setError(null);
    loadEarnings(tickerSymbols)
      .then((data) => {
        setEvents(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tickerSymbols]);

  const rows = groupByRelativeDate(events);
  const eventRows = rows.filter((r): r is DisplayRow & { kind: "event" } => r.kind === "event");
  const eventCount = eventRows.length;

  useKeyboard((ev) => {
    if (!focused) return;
    if (ev.name === "escape") {
      close?.();
      return;
    }
    if (ev.name === "j" || ev.name === "down") {
      setSelectedIdx((prev) => Math.min(prev + 1, eventCount - 1));
    }
    if (ev.name === "k" || ev.name === "up") {
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    }
    if (ev.name === "return") {
      const selected = eventRows[selectedIdx];
      if (selected) {
        const registry = getSharedRegistry();
        registry?.navigateTickerFn?.(selected.event.symbol);
      }
    }
    if (ev.name === "r") {
      setLoading(true);
      setError(null);
      loadEarnings(tickerSymbols, true)
        .then((data) => setEvents(data))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }
  });

  // Auto-scroll to keep selection visible
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    // Find the row index in the full rows array that corresponds to selectedIdx
    let targetRow = 0;
    let seen = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.kind === "event") {
        if (seen === selectedIdx) {
          targetRow = i;
          break;
        }
        seen++;
      }
    }
    scroll.scrollTo?.(0, Math.max(0, targetRow - Math.floor((height - 3) / 2)));
  }, [selectedIdx]);

  const dateColWidth = 8;
  const tickerColWidth = 8;
  const nameColWidth = Math.max(12, width - dateColWidth - tickerColWidth - 28);
  const epsColWidth = 10;
  const revColWidth = 10;

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <box height={1} paddingX={1} flexDirection="row">
        <text fg={colors.textDim}>
          {loading ? "loading..." : `${eventCount} upcoming`}
        </text>
      </box>

      {/* Column headers */}
      <box height={1} paddingX={1} flexDirection="row">
        <box width={dateColWidth}><text fg={colors.textDim}>DATE</text></box>
        <box width={tickerColWidth}><text fg={colors.textDim}>TICKER</text></box>
        <box width={nameColWidth}><text fg={colors.textDim}>NAME</text></box>
        <box width={epsColWidth}><text fg={colors.textDim}>EPS EST</text></box>
        <box width={revColWidth}><text fg={colors.textDim}>REV EST</text></box>
      </box>

      {error ? (
        <box paddingX={1}>
          <text fg={colors.negative}>{error}</text>
        </box>
      ) : eventCount === 0 && !loading ? (
        <box paddingX={1}>
          <text fg={colors.textMuted}>No upcoming earnings found</text>
        </box>
      ) : (
        <scrollbox ref={scrollRef} flexGrow={1} scrollY focusable={false}>
          <box flexDirection="column">
            {rows.map((row, i) => {
              if (row.kind === "separator") {
                return (
                  <box key={`sep-${i}`} height={1} paddingX={1}>
                    <text fg={colors.selected} attributes={TextAttributes.BOLD}>
                      {row.label}
                    </text>
                  </box>
                );
              }

              const isSelected = focused && row.eventIdx === selectedIdx;
              const isHovered = row.eventIdx === hoveredIdx;
              const bg = isSelected ? colors.selected : isHovered ? hoverBg() : undefined;
              const fg = isSelected ? colors.selectedText : colors.text;
              const dimFg = isSelected ? colors.selectedText : colors.textDim;

              return (
                <box
                  key={`ev-${row.event.symbol}-${i}`}
                  height={1}
                  paddingX={1}
                  flexDirection="row"
                  backgroundColor={bg}
                  onMouseMove={() => setHoveredIdx(row.eventIdx)}
                  onMouseOut={() => setHoveredIdx(null)}
                  onMouseDown={(event: any) => {
                    event.preventDefault?.();
                    if (selectedIdx === row.eventIdx) {
                      const registry = getSharedRegistry();
                      registry?.navigateTickerFn?.(row.event.symbol);
                    } else {
                      setSelectedIdx(row.eventIdx);
                    }
                  }}
                >
                  <box width={dateColWidth}>
                    <text fg={dimFg}>{formatDate(row.event.earningsDate)}</text>
                  </box>
                  <box width={tickerColWidth}>
                    <text fg={fg} attributes={TextAttributes.BOLD}>
                      {row.event.symbol.slice(0, tickerColWidth - 1)}
                    </text>
                  </box>
                  <box width={nameColWidth}>
                    <text fg={fg}>{row.event.name.slice(0, nameColWidth - 1)}</text>
                  </box>
                  <box width={epsColWidth}>
                    <text fg={dimFg}>
                      {row.event.epsEstimate != null ? row.event.epsEstimate.toFixed(2) : "—"}
                    </text>
                  </box>
                  <box width={revColWidth}>
                    <text fg={dimFg}>
                      {row.event.revenueEstimate != null ? formatCompact(row.event.revenueEstimate) : "—"}
                    </text>
                  </box>
                </box>
              );
            })}
          </box>
        </scrollbox>
      )}
    </box>
  );
}

export const earningsPlugin: GloomPlugin = {
  id: "earnings-calendar",
  name: "Earnings Calendar",
  version: "1.0.0",
  description: "Upcoming earnings dates for tracked tickers",
  toggleable: true,

  panes: [
    {
      id: "earnings-calendar",
      name: "Earnings Calendar",
      icon: "$",
      component: EarningsCalendarPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 85, height: 25 },
    },
  ],

  paneTemplates: [
    {
      id: "earnings-calendar-pane",
      paneId: "earnings-calendar",
      label: "Earnings Calendar",
      description: "Upcoming earnings dates and estimates for your tickers.",
      keywords: ["earn", "earnings", "calendar", "eps", "revenue", "quarterly"],
      shortcut: { prefix: "ERN" },
    },
  ],
};
