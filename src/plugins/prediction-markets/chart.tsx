import { useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes, type BoxRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import {
  buildChartScene,
  renderChart,
  resolveChartPalette,
  type StyledContent,
} from "../../components/chart/chart-renderer";
import {
  computeBitmapSize,
  renderNativeChartBase,
  type CellRect,
  type NativeChartBitmap,
} from "../../components/chart/native/chart-rasterizer";
import {
  ensureKittySupport,
  getCachedKittySupport,
} from "../../components/chart/native/kitty-support";
import { resolveChartRendererState } from "../../components/chart/native/renderer-selection";
import { getNativeSurfaceManager } from "../../components/chart/native/surface-manager";
import { syncCachedNativeSurface } from "../../components/chart/native/surface-sync";
import { projectChartData } from "../../components/chart/chart-data";
import { useAppState, usePaneInstanceId } from "../../state/app-context";
import { EmptyState } from "../../components/ui/status";
import { colors } from "../../theme/colors";
import { formatNumber, formatPercentRaw } from "../../utils/format";
import type { PricePoint } from "../../types/financials";
import type { PredictionHistoryPoint, PredictionHistoryRange } from "./types";

const RANGES: PredictionHistoryRange[] = ["1D", "1W", "1M", "ALL"];
const AXIS_WIDTH = 8;

interface RenderableNode {
  x: number;
  y: number;
  width: number;
  height: number;
  parent: RenderableNode | null;
}

function coercePredictionPointDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const next = new Date(value);
    return Number.isFinite(next.getTime()) ? next : null;
  }
  return null;
}

function toPricePoints(points: PredictionHistoryPoint[]): PricePoint[] {
  return points.flatMap((point) => {
    const date = coercePredictionPointDate(point.date);
    if (!date) return [];
    return [
      {
        date,
        close: point.close,
        open: point.open,
        high: point.high,
        low: point.low,
        volume: point.volume,
      },
    ];
  });
}

function extractCellRect(renderable: RenderableNode): CellRect {
  return {
    x: renderable.x,
    y: renderable.y,
    width: renderable.width,
    height: renderable.height,
  };
}

function intersectCellRects(left: CellRect, right: CellRect): CellRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  if (maxX <= x || maxY <= y) return null;
  return { x, y, width: maxX - x, height: maxY - y };
}

function resolveVisibleRect(
  renderable: RenderableNode | null,
  terminalWidth: number,
  terminalHeight: number,
): CellRect | null {
  if (!renderable) return null;

  let visible: CellRect = {
    x: 0,
    y: 0,
    width: terminalWidth,
    height: terminalHeight,
  };
  let current: RenderableNode | null = renderable;

  while (current) {
    const nextVisible = intersectCellRects(visible, extractCellRect(current));
    if (!nextVisible) return null;
    visible = nextVisible;
    current = current.parent;
  }

  return visible;
}

function buildBlankPlotLines(width: number, height: number): string[] {
  return Array.from({ length: height }, () => " ".repeat(width));
}

function buildNativeBitmapKey(
  points: PricePoint[],
  pixelWidth: number,
  pixelHeight: number,
  paletteId: string,
): string {
  const fingerprint = points
    .map(
      (point) =>
        `${point.date.getTime()}:${point.open}:${point.high}:${point.low}:${point.close}:${point.volume ?? 0}`,
    )
    .join("|");
  return [pixelWidth, pixelHeight, paletteId, fingerprint].join("::");
}

export function PredictionMarketChart({
  history,
  width,
  height,
  range,
  onRangeSelect,
}: {
  history: PredictionHistoryPoint[];
  width: number;
  height: number;
  range: PredictionHistoryRange;
  onRangeSelect: (range: PredictionHistoryRange) => void;
}) {
  const { state } = useAppState();
  const renderer = useRenderer();
  const paneId = usePaneInstanceId();
  const nativeSurfaceManager = useMemo(
    () => getNativeSurfaceManager(renderer),
    [renderer],
  );
  const [kittySupport, setKittySupport] = useState<boolean | null>(() =>
    getCachedKittySupport(renderer),
  );
  const plotRef = useRef<BoxRenderable>(null);
  const nativeSurfaceIdRef = useRef(`prediction-chart-surface:${paneId}`);
  const lastNativeBitmapRef = useRef<{
    key: string;
    bitmap: NativeChartBitmap;
  } | null>(null);
  const lastNativeGeometryRef = useRef<{
    rect: CellRect;
    visibleRect: CellRect | null;
  } | null>(null);

  const chartWidth = Math.max(width - AXIS_WIDTH - 2, 18);
  const chartHeight = Math.max(height - 2, 6);
  const hasHistory = history.length > 0;

  useEffect(() => {
    if (kittySupport !== null) return;
    let disposed = false;
    ensureKittySupport(renderer)
      .then((supported) => {
        if (!disposed) setKittySupport(supported);
      })
      .catch(() => {
        if (!disposed) setKittySupport(false);
      });
    return () => {
      disposed = true;
    };
  }, [kittySupport, renderer]);

  const pricePoints = useMemo(() => toPricePoints(history), [history]);
  const projection = useMemo(
    () => projectChartData(pricePoints, chartWidth, "area"),
    [chartWidth, pricePoints],
  );
  const first = projection.points[0] ?? null;
  const last = projection.points[projection.points.length - 1] ?? null;
  const delta = first && last ? last.close - first.close : 0;
  const deltaPct = first?.close ? (delta / first.close) * 100 : 0;
  const palette = useMemo(
    () =>
      resolveChartPalette(
        colors,
        delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
      ),
    [delta],
  );
  const rendererState = resolveChartRendererState(
    state.config.chartPreferences.renderer,
    kittySupport,
    renderer.resolution,
  );
  const effectiveRenderer = rendererState.renderer;

  const rendered = useMemo(
    () =>
      renderChart(projection.points, {
        width: chartWidth,
        height: chartHeight,
        mode: "area",
        showVolume: false,
        volumeHeight: 0,
        cursorX: null,
        cursorY: null,
        colors: palette,
        axisMode: "price",
        currency: "USD",
      }),
    [chartHeight, chartWidth, palette, projection.points],
  );

  const nativeScene = useMemo(
    () =>
      buildChartScene(projection.points, {
        width: chartWidth,
        height: chartHeight,
        showVolume: false,
        volumeHeight: 0,
        cursorX: null,
        cursorY: null,
        mode: "area",
        axisMode: "price",
        colors: palette,
      }),
    [chartHeight, chartWidth, palette, projection.points],
  );

  const axisByRow = useMemo(
    () => new Map(rendered.axisLabels.map((entry) => [entry.row, entry.label])),
    [rendered.axisLabels],
  );
  const blankPlotLines = useMemo(
    () => buildBlankPlotLines(chartWidth, chartHeight),
    [chartHeight, chartWidth],
  );

  useEffect(
    () => () => {
      lastNativeBitmapRef.current = null;
      lastNativeGeometryRef.current = null;
      nativeSurfaceManager.removeSurface(nativeSurfaceIdRef.current);
      renderer.requestRender();
    },
    [nativeSurfaceManager, renderer],
  );

  useEffect(() => {
    if (effectiveRenderer === "kitty" && rendererState.nativeReady) return;
    lastNativeBitmapRef.current = null;
    lastNativeGeometryRef.current = null;
    nativeSurfaceManager.removeSurface(nativeSurfaceIdRef.current);
  }, [effectiveRenderer, nativeSurfaceManager, rendererState.nativeReady]);

  useEffect(() => {
    if (
      effectiveRenderer !== "kitty" ||
      !rendererState.nativeReady ||
      !plotRef.current
    )
      return;
    const plot = plotRef.current;
    let mountTimer: ReturnType<typeof setTimeout> | null = null;

    const syncPlacement = () => {
      if (
        effectiveRenderer !== "kitty" ||
        !rendererState.nativeReady ||
        !plotRef.current
      )
        return;
      const rect = extractCellRect(plotRef.current);
      const visibleRect = resolveVisibleRect(
        plotRef.current,
        renderer.terminalWidth,
        renderer.terminalHeight,
      );
      const previous = lastNativeGeometryRef.current;
      if (
        previous &&
        previous.rect.x === rect.x &&
        previous.rect.y === rect.y &&
        previous.rect.width === rect.width &&
        previous.rect.height === rect.height &&
        previous.visibleRect?.x === visibleRect?.x &&
        previous.visibleRect?.y === visibleRect?.y &&
        previous.visibleRect?.width === visibleRect?.width &&
        previous.visibleRect?.height === visibleRect?.height
      ) {
        return;
      }
      lastNativeGeometryRef.current = { rect, visibleRect };
      syncCachedNativeSurface(
        nativeSurfaceManager,
        nativeSurfaceIdRef.current,
        { paneId, rect, visibleRect },
        lastNativeBitmapRef.current,
      );
    };

    plot.onLifecyclePass = syncPlacement;
    renderer.registerLifecyclePass(plot);
    syncPlacement();
    mountTimer = setTimeout(() => {
      syncPlacement();
      renderer.requestRender();
    }, 0);

    return () => {
      if (mountTimer) clearTimeout(mountTimer);
      plot.onLifecyclePass = null;
      renderer.unregisterLifecyclePass(plot);
      lastNativeGeometryRef.current = null;
    };
  }, [
    effectiveRenderer,
    nativeSurfaceManager,
    paneId,
    renderer,
    rendererState.nativeReady,
  ]);

  useEffect(() => {
    if (
      effectiveRenderer !== "kitty" ||
      !rendererState.nativeReady ||
      !renderer.resolution ||
      !plotRef.current ||
      !nativeScene
    ) {
      lastNativeBitmapRef.current = null;
      nativeSurfaceManager.removeSurface(nativeSurfaceIdRef.current);
      return;
    }

    const plotRect = extractCellRect(plotRef.current);
    const visibleRect = resolveVisibleRect(
      plotRef.current,
      renderer.terminalWidth,
      renderer.terminalHeight,
    );
    if (!visibleRect) {
      nativeSurfaceManager.removeSurface(nativeSurfaceIdRef.current);
      return;
    }

    const bitmapSize = computeBitmapSize(
      plotRect,
      renderer.resolution,
      renderer.terminalWidth,
      renderer.terminalHeight,
    );
    const bitmapKey = buildNativeBitmapKey(
      pricePoints,
      bitmapSize.pixelWidth,
      bitmapSize.pixelHeight,
      [palette.lineColor, palette.fillColor, palette.gridColor].join(","),
    );
    const cachedBitmap =
      lastNativeBitmapRef.current?.key === bitmapKey
        ? lastNativeBitmapRef.current.bitmap
        : null;
    const bitmap =
      cachedBitmap ??
      renderNativeChartBase(
        nativeScene,
        bitmapSize.pixelWidth,
        bitmapSize.pixelHeight,
      );
    if (!cachedBitmap) {
      lastNativeBitmapRef.current = { key: bitmapKey, bitmap };
    }

    nativeSurfaceManager.upsertSurface({
      id: nativeSurfaceIdRef.current,
      paneId,
      rect: plotRect,
      visibleRect,
      bitmap,
      bitmapKey,
    });
    renderer.requestRender();
  }, [
    effectiveRenderer,
    nativeScene,
    nativeSurfaceManager,
    paneId,
    palette.fillColor,
    palette.gridColor,
    palette.lineColor,
    pricePoints,
    renderer,
    rendererState.nativeReady,
  ]);

  const plotLines: Array<string | StyledContent> =
    effectiveRenderer === "kitty" ? blankPlotLines : rendered.lines;
  const plotContent = plotLines.map((line, index) => (
    <text key={index} content={line as any} />
  ));

  if (!hasHistory) {
    return (
      <box flexDirection="column" height={height}>
        <box flexDirection="row" gap={1} height={1}>
          {RANGES.map((entry) => {
            const active = entry === range;
            return (
              <box
                key={entry}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onRangeSelect(entry);
                }}
              >
                <text
                  fg={active ? colors.textBright : colors.textDim}
                  attributes={active ? TextAttributes.BOLD : 0}
                >
                  {entry}
                </text>
              </box>
            );
          })}
        </box>
        <box flexGrow={1} justifyContent="center">
          <EmptyState
            title="No chart history."
            hint="This venue did not return price history for the selected market."
          />
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" height={height}>
      <box flexDirection="row" height={1}>
        <box flexDirection="row" gap={1}>
          {RANGES.map((entry) => {
            const active = entry === range;
            return (
              <box
                key={entry}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onRangeSelect(entry);
                }}
              >
                <text
                  fg={active ? colors.textBright : colors.textDim}
                  attributes={active ? TextAttributes.BOLD : 0}
                >
                  {entry}
                </text>
              </box>
            );
          })}
        </box>
        <box flexGrow={1} />
        <text
          fg={
            delta > 0
              ? colors.positive
              : delta < 0
                ? colors.negative
                : colors.text
          }
        >
          {`${formatNumber(last?.close ?? 0, 3)}  ${formatPercentRaw(deltaPct)}`}
        </text>
      </box>

      <box flexDirection="row" height={chartHeight}>
        <box
          ref={plotRef}
          width={chartWidth}
          height={chartHeight}
          flexDirection="column"
          backgroundColor={palette.bgColor}
        >
          {plotContent}
        </box>
        <box width={1} />
        <box width={AXIS_WIDTH} flexDirection="column" height={chartHeight}>
          {Array.from({ length: chartHeight }, (_, index) => (
            <text key={index} fg={colors.textDim}>
              {axisByRow.get(index) ?? ""}
            </text>
          ))}
        </box>
      </box>

      <box height={1}>
        <text fg={colors.textDim}>{rendered.timeLabels}</text>
      </box>
    </box>
  );
}
