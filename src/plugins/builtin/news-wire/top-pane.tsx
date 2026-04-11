import { useRef, useEffect, useState } from "react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { PaneProps } from "../../../types/plugin";
import type { MarketNewsItem } from "../../../types/news-source";
import { colors, hoverBg } from "../../../theme/colors";
import { useTopStories } from "../../../news/hooks";
import { NewsDetailView } from "./news-detail-view";

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "<1m";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}


export function TopPane({ focused, width, height, close }: PaneProps) {
  const stories = useTopStories(20);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<MarketNewsItem | null>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  useKeyboard((event) => {
    if (!focused) return;

    if (event.name === "escape") {
      if (detailItem) { setDetailItem(null); return; }
      close?.();
      return;
    }

    if (detailItem) return;

    if (event.name === "j" || event.name === "down") {
      setSelectedIdx((prev) => Math.min(prev + 1, stories.length - 1));
    } else if (event.name === "k" || event.name === "up") {
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (event.name === "return") {
      const item = stories[selectedIdx];
      if (item) setDetailItem(item);
    }
  });

  useEffect(() => {
    const sb = scrollRef.current;
    if (!sb?.viewport || stories.length === 0 || selectedIdx < 0) return;
    const viewportHeight = Math.max(sb.viewport.height, 1);
    if (selectedIdx < sb.scrollTop) sb.scrollTo(selectedIdx);
    else if (selectedIdx >= sb.scrollTop + viewportHeight) sb.scrollTo(selectedIdx - viewportHeight + 1);
  }, [selectedIdx, stories.length]);

  if (detailItem) {
    return <NewsDetailView item={detailItem} width={width} height={height} onClose={() => setDetailItem(null)} />;
  }

  const rankW = 3;
  const srcW = 5;
  const timeW = 4;
  const titleW = Math.max(10, width - rankW - srcW - timeW - 5);

  return (
    <box flexDirection="column" width={width} height={height}>
      <scrollbox ref={scrollRef} flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {stories.map((item, idx) => {
            const isSelected = idx === selectedIdx;
            const isHovered = idx === hoveredIdx;
            const bg = isSelected ? colors.selected : isHovered ? hoverBg() : undefined;
            const fg = isSelected ? colors.selectedText : colors.text;
            const dimFg = isSelected ? colors.selectedText : colors.textDim;
            const srcBadge = item.source.slice(0, srcW).toUpperCase().padEnd(srcW);
            const timeStr = relativeTime(item.publishedAt).padStart(timeW);
            const rank = String(idx + 1).padStart(rankW);
            const title = item.title.slice(0, titleW);

            return (
              <box
                key={item.id}
                flexDirection="row"
                height={1}
                paddingX={1}
                backgroundColor={bg}
                onMouseMove={() => setHoveredIdx(idx)}
                onMouseOut={() => setHoveredIdx(null)}
                onMouseDown={(event: any) => {
                  event.preventDefault?.();
                  if (selectedIdx === idx) {
                    setDetailItem(item);
                  } else {
                    setSelectedIdx(idx);
                  }
                }}
              >
                <box width={rankW + 1}>
                  <text fg={dimFg}>{rank}</text>
                </box>
                <box width={srcW + 1}>
                  <text fg={isSelected ? colors.selectedText : colors.textMuted}>{srcBadge}</text>
                </box>
                <box width={timeW + 1}>
                  <text fg={dimFg}>{timeStr}</text>
                </box>
                <box flexGrow={1}>
                  <text fg={fg}>{title}</text>
                </box>
              </box>
            );
          })}
        </box>
      </scrollbox>
      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>j/k navigate · Enter open · Esc close</text>
      </box>
    </box>
  );
}
