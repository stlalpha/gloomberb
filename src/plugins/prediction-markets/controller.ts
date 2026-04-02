import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type InputRenderable, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { usePaneInstance } from "../../state/app-context";
import { usePluginPaneState, usePluginState } from "../plugin-runtime";
import { getAdjacentPredictionCategoryId } from "./categories";
import { usePredictionMarketsDataState } from "./controller-data";
import { resolvePredictionKeyboardCommand } from "./keyboard";
import {
  getAdjacentPredictionDetailTab,
  getAdjacentPredictionVenueScope,
  parsePredictionSearchShortcut,
  parsePredictionVenueScope,
} from "./navigation";
import { getDefaultPredictionSort, getNextPredictionSort } from "./metrics";
import {
  getPredictionMarketsPaneSettings,
  resolvePredictionColumns,
} from "./settings";
import type {
  PredictionBrowseTab,
  PredictionCategoryId,
  PredictionDetailTab,
  PredictionFocusRegion,
  PredictionHistoryRange,
  PredictionListRow,
  PredictionOrderPreviewIntent,
  PredictionSortPreference,
  PredictionVenueScope,
} from "./types";

const EMPTY_SELECTIONS: Record<string, string | null> = {};
const KEYBOARD_DETAIL_LOAD_DELAY_MS = 140;

export function usePredictionMarketsController({
  focused,
}: {
  focused: boolean;
}) {
  const paneInstance = usePaneInstance();
  const paneSettings = useMemo(
    () => getPredictionMarketsPaneSettings(paneInstance?.settings),
    [paneInstance?.settings],
  );
  const initialParams = paneInstance?.params;

  const [watchlist, setWatchlist] = usePluginState<string[]>(
    "watchlist:v1",
    [],
  );
  const [lastVenueScope, setLastVenueScope] =
    usePluginState<PredictionVenueScope>("lastVenueScope:v1", "all");

  const [venueScope, setVenueScope] = usePluginPaneState<PredictionVenueScope>(
    "venueScope",
    paneSettings.hideTabs ? paneSettings.lockedVenueScope : lastVenueScope,
  );
  const [browseTab, setBrowseTab] = usePluginPaneState<PredictionBrowseTab>(
    "browseTab",
    paneSettings.defaultBrowseTab,
  );
  const [detailTab, setDetailTab] = usePluginPaneState<PredictionDetailTab>(
    "detailTab",
    "overview",
  );
  const [focusRegion, setFocusRegion] = usePluginPaneState<PredictionFocusRegion>(
    "focusRegion",
    "list",
  );
  const [searchQuery, setSearchQuery] = usePluginPaneState<string>(
    "searchQuery",
    "",
  );
  const [categoryId, setCategoryId] = usePluginPaneState<PredictionCategoryId>(
    "categoryId",
    "all",
  );
  const [historyRange, setHistoryRange] =
    usePluginPaneState<PredictionHistoryRange>("historyRange", "1M");
  const [detailSplitRatio, setDetailSplitRatio] = usePluginPaneState<number>(
    "detailSplitRatio",
    0.42,
  );
  const [selectedRowKey, setSelectedRowKey] = usePluginPaneState<
    string | null
  >("selectedRowKey", null);
  const [selectedDetailMarketKey, setSelectedDetailMarketKey] =
    usePluginPaneState<string | null>("selectedDetailMarketKey", null);
  const [, setSelectionByScope] = usePluginPaneState<
    Record<string, string | null>
  >("selectionByScope", EMPTY_SELECTIONS);
  const [sortPreference, setSortPreference] =
    usePluginPaneState<PredictionSortPreference>(
      "sortPreference",
      getDefaultPredictionSort(paneSettings.defaultBrowseTab),
    );
  const [, setOrderPreviewIntent] =
    usePluginPaneState<PredictionOrderPreviewIntent | null>(
      "orderPreviewIntent",
      null,
    );

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);

  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const headerScrollRef = useRef<ScrollBoxRenderable>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable>(null);
  const searchInputRef = useRef<InputRenderable>(null);
  const previousFilterResetKeyRef = useRef<string | null>(null);

  const effectiveVenueScope = paneSettings.hideTabs
    ? paneSettings.lockedVenueScope
    : venueScope;
  const includePolymarket =
    effectiveVenueScope === "all" || effectiveVenueScope === "polymarket";
  const includeKalshi =
    effectiveVenueScope === "all" || effectiveVenueScope === "kalshi";
  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);
  const visibleColumns = useMemo(
    () => resolvePredictionColumns(paneSettings.columnIds),
    [paneSettings.columnIds],
  );

  const data = usePredictionMarketsDataState({
    browseTab,
    categoryId,
    effectiveVenueScope,
    focused,
    historyRange,
    includeKalshi,
    includePolymarket,
    searchQuery,
    selectedDetailMarketKey,
    selectedRowKey,
    sortPreference,
    watchlistSet,
  });

  const syncHeaderScroll = useCallback(() => {
    const bodyScrollBox = scrollRef.current;
    const headerScrollBox = headerScrollRef.current;
    if (
      bodyScrollBox &&
      headerScrollBox &&
      headerScrollBox.scrollLeft !== bodyScrollBox.scrollLeft
    ) {
      headerScrollBox.scrollLeft = bodyScrollBox.scrollLeft;
    }
  }, []);

  const onBodyScrollActivity = useCallback(() => {
    syncHeaderScroll();
  }, [syncHeaderScroll]);

  useEffect(() => {
    if (paneSettings.hideTabs && venueScope !== paneSettings.lockedVenueScope) {
      setVenueScope(paneSettings.lockedVenueScope);
      return;
    }
    if (!paneSettings.hideTabs && effectiveVenueScope !== lastVenueScope) {
      setLastVenueScope(effectiveVenueScope);
    }
  }, [
    effectiveVenueScope,
    lastVenueScope,
    paneSettings.hideTabs,
    paneSettings.lockedVenueScope,
    setLastVenueScope,
    setVenueScope,
    venueScope,
  ]);

  useEffect(() => {
    if (initialParamsApplied) return;
    const parsedScope = parsePredictionVenueScope(initialParams?.scope);
    const shortcut = parsePredictionSearchShortcut(initialParams?.query ?? "");
    if (parsedScope) {
      setVenueScope(parsedScope);
      setLastVenueScope(parsedScope);
    } else if (shortcut.searchQuery || shortcut.venueScope !== "all") {
      setVenueScope(shortcut.venueScope);
      setLastVenueScope(shortcut.venueScope);
    }
    if (shortcut.searchQuery) {
      setSearchQuery(shortcut.searchQuery);
    }
    setInitialParamsApplied(true);
  }, [
    initialParams?.query,
    initialParams?.scope,
    initialParamsApplied,
    setLastVenueScope,
    setSearchQuery,
    setVenueScope,
  ]);

  useEffect(() => {
    const nextDefault = getDefaultPredictionSort(browseTab);
    setSortPreference((current) =>
      current.columnId === nextDefault.columnId &&
      current.direction === nextDefault.direction
        ? current
        : nextDefault,
    );
  }, [browseTab, setSortPreference]);

  useEffect(() => {
    const nextFilterResetKey = [
      browseTab,
      categoryId,
      data.debouncedSearchQuery,
      effectiveVenueScope,
    ].join("|");
    if (previousFilterResetKeyRef.current === nextFilterResetKey) {
      return;
    }
    const previousFilterResetKey = previousFilterResetKeyRef.current;
    previousFilterResetKeyRef.current = nextFilterResetKey;
    if (previousFilterResetKey == null) {
      return;
    }
    setHoveredIdx(null);
    const scrollBox = scrollRef.current;
    if (scrollBox) {
      scrollBox.scrollTop = 0;
      scrollBox.scrollLeft = 0;
    }
    const headerScrollBox = headerScrollRef.current;
    if (headerScrollBox) {
      headerScrollBox.scrollLeft = 0;
    }
    setFocusRegion("list");
    setSelectedRowKey((current) => (current == null ? current : null));
    setSelectedDetailMarketKey((current) => (current == null ? current : null));
  }, [
    browseTab,
    categoryId,
    data.debouncedSearchQuery,
    effectiveVenueScope,
    setFocusRegion,
    setSelectedDetailMarketKey,
    setSelectedRowKey,
  ]);

  useEffect(() => {
    if (data.visibleRows.length === 0) {
      if (selectedRowKey !== null) setSelectedRowKey(null);
      if (selectedDetailMarketKey !== null) setSelectedDetailMarketKey(null);
      if (focusRegion !== "list") setFocusRegion("list");
      return;
    }

    if (data.selectedRow) {
      setSelectionByScope((current) => {
        if (current[effectiveVenueScope] === data.selectedRow!.key) {
          return current;
        }
        return { ...current, [effectiveVenueScope]: data.selectedRow!.key };
      });
      if (
        !selectedDetailMarketKey ||
        !data.selectedRow.markets.some(
          (market) => market.key === selectedDetailMarketKey,
        )
      ) {
        setSelectedDetailMarketKey(data.selectedRow.focusMarketKey);
      }
      return;
    }

    if (selectedRowKey !== null) {
      setSelectedRowKey(null);
    }
    if (selectedDetailMarketKey !== null) {
      setSelectedDetailMarketKey(null);
    }
  }, [
    data.selectedRow,
    data.visibleRows,
    effectiveVenueScope,
    focusRegion,
    selectedDetailMarketKey,
    selectedRowKey,
    setFocusRegion,
    setSelectedDetailMarketKey,
    setSelectedRowKey,
    setSelectionByScope,
  ]);

  useEffect(() => {
    if (data.selectedIndex < 0) return;
    const scrollBox = scrollRef.current;
    if (!scrollBox?.viewport) return;
    if (data.selectedIndex < scrollBox.scrollTop) {
      scrollBox.scrollTop = data.selectedIndex;
    } else if (
      data.selectedIndex >=
      scrollBox.scrollTop + scrollBox.viewport.height
    ) {
      scrollBox.scrollTop = Math.max(
        0,
        data.selectedIndex - scrollBox.viewport.height + 1,
      );
    }
  }, [data.selectedIndex]);

  useEffect(() => {
    if (!searchFocused) return;
    searchInputRef.current?.focus?.();
  }, [searchFocused]);

  const focusSearch = useCallback(() => {
    setFocusRegion("list");
    setSearchFocused(true);
  }, [setFocusRegion]);

  const blurSearch = useCallback(() => {
    setSearchFocused(false);
  }, []);

  const toggleWatchlist = useCallback(
    (row: PredictionListRow) => {
      const rowMarketKeys = [...new Set(row.watchMarketKeys)];
      setWatchlist((current) => {
        const allWatched = rowMarketKeys.every((marketKey) =>
          current.includes(marketKey),
        );
        if (allWatched) {
          return current.filter((entry) => !rowMarketKeys.includes(entry));
        }
        return [...new Set([...current, ...rowMarketKeys])];
      });
    },
    [setWatchlist],
  );

  const selectRow = useCallback(
    (rowKey: string, options?: { debounceDetail?: boolean }) => {
      setSearchFocused(false);
      setFocusRegion("list");
      const row = data.visibleRows.find((candidate) => candidate.key === rowKey);
      const shouldClear = selectedRowKey === rowKey;
      data.actions.setNextDetailLoadDelay(
        options?.debounceDetail && !shouldClear
          ? KEYBOARD_DETAIL_LOAD_DELAY_MS
          : 0,
      );
      setSelectedRowKey(shouldClear ? null : rowKey);
      setSelectedDetailMarketKey(
        shouldClear ? null : row?.focusMarketKey ?? null,
      );
    },
    [
      data.actions,
      data.visibleRows,
      selectedRowKey,
      setFocusRegion,
      setSelectedDetailMarketKey,
      setSelectedRowKey,
    ],
  );

  const selectMarket = useCallback(
    (marketKey: string) => {
      setSearchFocused(false);
      setFocusRegion("detail");
      data.actions.setNextDetailLoadDelay(0);
      const row = data.visibleRows.find((candidate) =>
        candidate.markets.some((market) => market.key === marketKey),
      );
      if (!row) {
        setSelectedRowKey(null);
        setSelectedDetailMarketKey(null);
        return;
      }
      setSelectedRowKey(row.key);
      setSelectedDetailMarketKey(marketKey);
    },
    [
      data.actions,
      data.visibleRows,
      setFocusRegion,
      setSelectedDetailMarketKey,
      setSelectedRowKey,
    ],
  );

  const clearSelection = useCallback(() => {
    data.actions.setNextDetailLoadDelay(0);
    setFocusRegion("list");
    setSelectedRowKey(null);
    setSelectedDetailMarketKey(null);
  }, [
    data.actions,
    setFocusRegion,
    setSelectedDetailMarketKey,
    setSelectedRowKey,
  ]);

  const focusList = useCallback(() => {
    setFocusRegion("list");
    setSearchFocused(false);
  }, [setFocusRegion]);

  const focusDetail = useCallback(() => {
    if (!data.selectedSummary) return;
    setFocusRegion("detail");
    setSearchFocused(false);
  }, [data.selectedSummary, setFocusRegion]);

  const setVenue = useCallback(
    (nextVenueScope: string) => {
      const typed = nextVenueScope as PredictionVenueScope;
      setSearchFocused(false);
      setVenueScope(typed);
      setLastVenueScope(typed);
    },
    [setLastVenueScope, setVenueScope],
  );

  const selectBrowseTab = useCallback(
    (nextBrowseTab: PredictionBrowseTab) => {
      setSearchFocused(false);
      setBrowseTab(nextBrowseTab);
    },
    [setBrowseTab],
  );

  const selectCategory = useCallback(
    (nextCategoryId: PredictionCategoryId) => {
      setSearchFocused(false);
      setCategoryId(nextCategoryId);
    },
    [setCategoryId],
  );

  const handleSortHeaderClick = useCallback(
    (columnId: string) => {
      setSearchFocused(false);
      setSortPreference((current) => getNextPredictionSort(current, columnId));
    },
    [setSortPreference],
  );

  const previewOrder = useCallback(
    (intent: PredictionOrderPreviewIntent) => {
      setOrderPreviewIntent(intent);
    },
    [setOrderPreviewIntent],
  );

  const cycleDetailOutcome = useCallback(
    (direction: "previous" | "next") => {
      if (detailTab !== "overview" || data.sortedOutcomeMarkets.length === 0) {
        return;
      }
      const currentIndex = data.sortedOutcomeMarkets.findIndex(
        (market) => market.key === data.selectedSummaryKey,
      );
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        direction === "previous"
          ? Math.max(safeIndex - 1, 0)
          : Math.min(safeIndex + 1, data.sortedOutcomeMarkets.length - 1);
      const nextMarket = data.sortedOutcomeMarkets[nextIndex];
      if (nextMarket) {
        selectMarket(nextMarket.key);
      }
    },
    [data.selectedSummaryKey, data.sortedOutcomeMarkets, detailTab, selectMarket],
  );

  const scrollDetailBy = useCallback((delta: number) => {
    const scrollBox = detailScrollRef.current;
    if (!scrollBox) return;
    const maxScrollTop = Math.max(
      0,
      scrollBox.scrollHeight - scrollBox.viewport.height,
    );
    scrollBox.scrollTop = Math.max(
      0,
      Math.min(maxScrollTop, scrollBox.scrollTop + delta),
    );
  }, []);

  const handleKeyboard = useCallback(
    (event: {
      name?: string;
      sequence?: string;
      shift?: boolean;
      stopPropagation?: () => void;
    }) => {
      if (!focused) return;
      const command = resolvePredictionKeyboardCommand(event);
      const key = event.name?.toLowerCase();
      const isEnter = key === "enter" || key === "return";

      if (searchFocused) {
        if (command === "escape") {
          event.stopPropagation?.();
          setSearchFocused(false);
        }
        return;
      }

      if (command === "search") {
        event.stopPropagation?.();
        focusSearch();
        return;
      }

      if (command === "escape") {
        event.stopPropagation?.();
        if (focusRegion === "detail") {
          focusList();
          return;
        }
        clearSelection();
        return;
      }

      if (isEnter && data.selectedSummary) {
        event.stopPropagation?.();
        if (focusRegion === "list") {
          focusDetail();
        } else {
          focusList();
        }
        return;
      }

      if (focusRegion === "detail") {
        if (command === "move-down") {
          event.stopPropagation?.();
          if (detailTab === "overview" && data.sortedOutcomeMarkets.length > 0) {
            cycleDetailOutcome("next");
          } else {
            scrollDetailBy(1);
          }
          return;
        }

        if (command === "move-up") {
          event.stopPropagation?.();
          if (detailTab === "overview" && data.sortedOutcomeMarkets.length > 0) {
            cycleDetailOutcome("previous");
          } else {
            scrollDetailBy(-1);
          }
          return;
        }

        if (command === "previous-category") {
          event.stopPropagation?.();
          setDetailTab(getAdjacentPredictionDetailTab(detailTab, "previous"));
          return;
        }

        if (command === "next-category") {
          event.stopPropagation?.();
          setDetailTab(getAdjacentPredictionDetailTab(detailTab, "next"));
          return;
        }
      }

      if (command === "move-down") {
        event.stopPropagation?.();
        if (data.visibleRows.length === 0) return;
        const nextIndex =
          data.selectedIndex >= 0
            ? Math.min(data.selectedIndex + 1, data.visibleRows.length - 1)
            : 0;
        selectRow(data.visibleRows[nextIndex]!.key, { debounceDetail: true });
        return;
      }

      if (command === "move-up") {
        event.stopPropagation?.();
        if (data.visibleRows.length === 0) return;
        const nextIndex =
          data.selectedIndex >= 0 ? Math.max(data.selectedIndex - 1, 0) : 0;
        selectRow(data.visibleRows[nextIndex]!.key, { debounceDetail: true });
        return;
      }

      if (!paneSettings.hideTabs && command === "previous-venue-tab") {
        event.stopPropagation?.();
        setVenue(
          getAdjacentPredictionVenueScope(effectiveVenueScope, "previous"),
        );
        return;
      }

      if (!paneSettings.hideTabs && command === "next-venue-tab") {
        event.stopPropagation?.();
        setVenue(getAdjacentPredictionVenueScope(effectiveVenueScope, "next"));
        return;
      }

      if (command === "previous-category") {
        event.stopPropagation?.();
        selectCategory(getAdjacentPredictionCategoryId(categoryId, "previous"));
        return;
      }

      if (command === "next-category") {
        event.stopPropagation?.();
        selectCategory(getAdjacentPredictionCategoryId(categoryId, "next"));
        return;
      }

      if (command === "toggle-watchlist" && data.selectedSummary) {
        event.stopPropagation?.();
        if (data.selectedRow) toggleWatchlist(data.selectedRow);
        return;
      }

      if (command === "browse-top") {
        selectBrowseTab("top");
        return;
      }
      if (command === "browse-ending") {
        selectBrowseTab("ending");
        return;
      }
      if (command === "browse-new") {
        selectBrowseTab("new");
        return;
      }
      if (command === "browse-watchlist") {
        selectBrowseTab("watchlist");
      }
    },
    [
      browseTab,
      categoryId,
      clearSelection,
      cycleDetailOutcome,
      data.selectedIndex,
      data.selectedRow,
      data.selectedSummary,
      data.sortedOutcomeMarkets.length,
      data.visibleRows,
      detailTab,
      effectiveVenueScope,
      focusDetail,
      focusList,
      focusRegion,
      focusSearch,
      focused,
      paneSettings.hideTabs,
      scrollDetailBy,
      searchFocused,
      selectBrowseTab,
      selectCategory,
      selectRow,
      setVenue,
      toggleWatchlist,
    ],
  );

  useKeyboard(handleKeyboard);

  const searchPending = searchQuery.trim() !== data.debouncedSearchQuery.trim();
  const searchLoading =
    searchQuery.trim().length > 0 && (searchPending || data.catalogLoadCount > 0);

  return {
    paneSettings,
    browseTab,
    categoryId,
    catalogError: data.catalogError,
    catalogLoadCount: data.catalogLoadCount,
    detail: data.detail,
    detailError: data.detailError,
    detailLoadCount: data.detailLoadCount,
    detailScrollRef,
    detailTab,
    detailSplitRatio,
    effectiveVenueScope,
    focusRegion,
    headerScrollRef,
    historyRange,
    hoveredIdx,
    lastRefreshAt: data.lastRefreshAt,
    scrollRef,
    searchFocused,
    searchInputRef,
    searchLoading,
    searchQuery,
    selectedRow: data.selectedRow,
    selectedSummary: data.selectedSummary,
    sortPreference,
    transportState: data.transportState,
    visibleColumns,
    visibleRows: data.visibleRows,
    watchlistSet,
    actions: {
      blurSearch,
      clearSelection,
      focusDetail,
      focusList,
      focusSearch,
      handleSortHeaderClick,
      previewOrder,
      selectBrowseTab,
      selectCategory,
      selectMarket,
      selectRow,
      setDetailTab,
      setDetailSplitRatio,
      setHistoryRange,
      setHoveredIdx,
      setSearchQuery,
      setVenue,
      toggleWatchlist,
    },
    layout: {
      onBodyScrollActivity,
      syncHeaderScroll,
    },
  };
}
