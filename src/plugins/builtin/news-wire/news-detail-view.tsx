import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { MarketNewsItem } from "../../../types/news-source";
import { colors } from "../../../theme/colors";
import { getSharedRegistry } from "../../registry";

export function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function NewsDetailView({ item, width, height, onClose }: {
  item: MarketNewsItem;
  width: number;
  height: number;
  onClose: () => void;
}) {
  const registry = getSharedRegistry();

  useKeyboard((event) => {
    if (event.name === "escape") {
      onClose();
    }
  });

  const innerW = Math.max(10, width - 2);
  const titleLines = wrapText(item.title, innerW);
  const summaryLines = item.summary ? wrapText(item.summary, innerW) : [];
  const dateStr = item.publishedAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <box flexDirection="column" width={width} height={height}>
      <scrollbox flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
          {/* Title */}
          <box flexDirection="column">
            {titleLines.map((line, i) => (
              <box key={i} height={1}>
                <text fg={colors.textBright} attributes={TextAttributes.BOLD}>{line}</text>
              </box>
            ))}
          </box>
          {/* Source + time */}
          <box height={1} flexDirection="row">
            <text fg={colors.text}>{item.source}</text>
            <text fg={colors.textDim}>  {dateStr}</text>
          </box>
          {/* Summary */}
          {summaryLines.length > 0 && (
            <box flexDirection="column">
              {summaryLines.map((line, i) => (
                <box key={i} height={1}>
                  <text fg={colors.text}>{line}</text>
                </box>
              ))}
            </box>
          )}
          {/* Tickers */}
          {item.tickers.length > 0 && (
            <box flexDirection="row" flexWrap="wrap" gap={1}>
              {item.tickers.map((ticker) => (
                <text
                  key={ticker}
                  fg={colors.textBright}
                  attributes={TextAttributes.UNDERLINE}
                  onMouseDown={() => registry?.navigateTickerFn(ticker)}
                >
                  {ticker}
                </text>
              ))}
            </box>
          )}
          {/* Categories */}
          {item.categories.length > 0 && (
            <box height={1} flexDirection="row">
              <text fg={colors.textMuted}>
                {item.categories.join(" · ")}
              </text>
            </box>
          )}
          {/* URL */}
          <box height={1}>
            <text fg={colors.textDim}>{item.url}</text>
          </box>
        </box>
      </scrollbox>
      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>Esc back</text>
      </box>
    </box>
  );
}
