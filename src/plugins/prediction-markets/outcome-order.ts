import type { PredictionMarketSummary } from "./types";

export function sortPredictionOutcomeMarkets(
  markets: PredictionMarketSummary[],
): PredictionMarketSummary[] {
  return [...markets].sort((left, right) => {
    const yesDelta = (right.yesPrice ?? -1) - (left.yesPrice ?? -1);
    if (yesDelta !== 0) return yesDelta;
    const volumeDelta = (right.volume24h ?? 0) - (left.volume24h ?? 0);
    if (volumeDelta !== 0) return volumeDelta;
    return left.marketLabel.localeCompare(right.marketLabel);
  });
}

export function getPredictionTopOutcome(
  markets: PredictionMarketSummary[],
): PredictionMarketSummary | null {
  return sortPredictionOutcomeMarkets(markets)[0] ?? null;
}
