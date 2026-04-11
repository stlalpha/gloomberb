export function computeSharpeRatio(returns: number[], riskFreeRate = 0.05): number | null {
  if (returns.length < 10) return null;
  const n = returns.length;
  const meanReturn = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (variance < Number.EPSILON) return null;
  const annualizedReturn = meanReturn * 252;
  const annualizedStdDev = stdDev * Math.sqrt(252);
  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

export function computeBeta(assetReturns: number[], marketReturns: number[]): number | null {
  const n = Math.min(assetReturns.length, marketReturns.length);
  if (n < 10) return null;
  let sumMarket = 0, sumAsset = 0;
  for (let i = 0; i < n; i++) {
    sumMarket += marketReturns[i]!;
    sumAsset += assetReturns[i]!;
  }
  const meanMarket = sumMarket / n;
  const meanAsset = sumAsset / n;
  let covariance = 0, marketVariance = 0;
  for (let i = 0; i < n; i++) {
    const dm = marketReturns[i]! - meanMarket;
    const da = assetReturns[i]! - meanAsset;
    covariance += dm * da;
    marketVariance += dm * dm;
  }
  if (marketVariance === 0) return null;
  return covariance / marketVariance;
}

export interface SectorAllocation {
  sector: string;
  weight: number;
  value: number;
}

export function computeSectorAllocation(
  positions: Array<{ sector: string; marketValue: number }>,
): SectorAllocation[] {
  const sectorMap = new Map<string, number>();
  let total = 0;
  for (const pos of positions) {
    const sector = pos.sector || "Unknown";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + pos.marketValue);
    total += pos.marketValue;
  }
  if (total === 0) return [];
  return [...sectorMap.entries()]
    .map(([sector, value]) => ({ sector, weight: value / total, value }))
    .sort((a, b) => b.weight - a.weight || a.sector.localeCompare(b.sector));
}
