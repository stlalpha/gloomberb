import { TextAttributes } from "@opentui/core";
import { colors } from "../../../theme/colors";
import { formatPercentRaw } from "../../../utils/format";
import { PredictionMarketChart } from "../chart";
import type {
  PredictionHistoryRange,
  PredictionListRow,
  PredictionMarketDetail,
  PredictionMarketSummary,
} from "../types";
import { PredictionMarketOutcomesView } from "./outcomes";
import { SummaryLink } from "./shared";

export function PredictionMarketOverviewView({
  detail,
  detailWidth,
  height,
  historyRange,
  onHistoryRangeChange,
  onSelectMarket,
  selectedRow,
  summary,
}: {
  detail: PredictionMarketDetail | null;
  detailWidth: number;
  height: number;
  historyRange: PredictionHistoryRange;
  onHistoryRangeChange: (range: PredictionHistoryRange) => void;
  onSelectMarket: (marketKey: string) => void;
  selectedRow: PredictionListRow | null;
  summary: PredictionMarketSummary;
}) {
  return (
    <box flexDirection="column" gap={1}>
      {selectedRow?.kind === "group" && (
        <PredictionMarketOutcomesView
          detailWidth={detailWidth}
          onSelectMarket={onSelectMarket}
          selectedMarketKey={summary.key}
          selectedRow={selectedRow}
        />
      )}
      <PredictionMarketChart
        history={detail?.history ?? []}
        width={detailWidth}
        height={Math.max(Math.floor(height * 0.36), 10)}
        range={historyRange}
        onRangeSelect={onHistoryRangeChange}
      />
      <SummaryLink
        url={summary.url}
        maxLength={Math.max(detailWidth - 8, 12)}
      />
      {summary.description && (
        <box flexDirection="column">
          <text fg={colors.textBright} attributes={TextAttributes.BOLD}>
            Description
          </text>
          <text fg={colors.text}>{summary.description}</text>
        </box>
      )}
      <box height={1}>
        <text fg={colors.textDim}>
          {detail?.history &&
          detail.history.length > 1 &&
          summary.yesPrice != null
            ? `Range move ${formatPercentRaw((((detail.history[detail.history.length - 1]?.close ?? summary.yesPrice) - (detail.history[0]?.close ?? summary.yesPrice)) / Math.max(detail.history[0]?.close ?? summary.yesPrice, 0.0001)) * 100)}`
            : "No extended move data."}
        </text>
      </box>
    </box>
  );
}
