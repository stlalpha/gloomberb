import { describe, expect, test } from "bun:test";
import { computeReturns, pearsonCorrelation, formatCorrelation } from "./compute";

describe("computeReturns", () => {
  test("computes simple returns", () => {
    const returns = computeReturns([100, 110, 105, 115]);
    expect(returns).toHaveLength(3);
    expect(returns[0]).toBeCloseTo(0.1, 5);
    expect(returns[1]).toBeCloseTo(-0.0455, 3);
    expect(returns[2]).toBeCloseTo(0.0952, 3);
  });

  test("returns empty for single value", () => {
    expect(computeReturns([100])).toEqual([]);
  });
});

describe("pearsonCorrelation", () => {
  test("perfect positive correlation", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1.0, 5);
  });

  test("perfect negative correlation", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1.0, 5);
  });

  test("returns null for insufficient data", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBeNull();
  });

  test("returns null for zero variance", () => {
    expect(pearsonCorrelation([5, 5, 5, 5, 5], [1, 2, 3, 4, 5])).toBeNull();
  });
});

describe("formatCorrelation", () => {
  test("formats positive", () => {
    expect(formatCorrelation(0.85)).toContain("0.85");
  });
  test("formats negative", () => {
    expect(formatCorrelation(-0.42)).toContain("-0.42");
  });
  test("formats null as dash", () => {
    expect(formatCorrelation(null)).toContain("—");
  });
});
