import { describe, expect, test } from "bun:test";
import { computeSharpeRatio, computeBeta, computeSectorAllocation } from "./metrics";

describe("computeSharpeRatio", () => {
  test("computes positive Sharpe for good returns", () => {
    const returns = Array.from({ length: 20 }, () => 0.005 + (Math.random() - 0.5) * 0.001);
    const sharpe = computeSharpeRatio(returns);
    expect(sharpe).not.toBeNull();
    expect(sharpe!).toBeGreaterThan(0);
  });

  test("returns null for insufficient data", () => {
    expect(computeSharpeRatio([0.01, 0.02])).toBeNull();
  });

  test("returns null for zero variance", () => {
    expect(computeSharpeRatio(Array(20).fill(0.01))).toBeNull();
  });
});

describe("computeBeta", () => {
  test("beta of 1 when returns match market", () => {
    const returns = Array.from({ length: 20 }, () => Math.random() * 0.02 - 0.01);
    const beta = computeBeta(returns, returns);
    expect(beta).toBeCloseTo(1.0, 1);
  });

  test("returns null for insufficient data", () => {
    expect(computeBeta([0.01], [0.01])).toBeNull();
  });
});

describe("computeSectorAllocation", () => {
  test("computes weights from positions", () => {
    const alloc = computeSectorAllocation([
      { sector: "Technology", marketValue: 60000 },
      { sector: "Healthcare", marketValue: 40000 },
    ]);
    expect(alloc).toHaveLength(2);
    expect(alloc[0]!.sector).toBe("Technology");
    expect(alloc[0]!.weight).toBeCloseTo(0.6, 2);
  });

  test("groups same sectors", () => {
    const alloc = computeSectorAllocation([
      { sector: "Tech", marketValue: 30000 },
      { sector: "Tech", marketValue: 20000 },
      { sector: "Health", marketValue: 50000 },
    ]);
    expect(alloc).toHaveLength(2);
    expect(alloc[0]!.sector).toBe("Health");
    expect(alloc[0]!.weight).toBeCloseTo(0.5, 2);
  });

  test("returns empty for zero total value", () => {
    expect(computeSectorAllocation([])).toEqual([]);
  });

  test("uses Unknown for missing sector", () => {
    const alloc = computeSectorAllocation([{ sector: "", marketValue: 100 }]);
    expect(alloc[0]!.sector).toBe("Unknown");
  });
});
