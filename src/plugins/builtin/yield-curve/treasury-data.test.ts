import { describe, expect, test } from "bun:test";
import { parseYieldPoints, isInverted, TREASURY_MATURITIES, type YieldPoint } from "./treasury-data";

describe("parseYieldPoints", () => {
  test("filters out null yields", () => {
    const points: YieldPoint[] = [
      { maturity: "2Y", maturityYears: 2, yield: 4.5 },
      { maturity: "5Y", maturityYears: 5, yield: null },
      { maturity: "10Y", maturityYears: 10, yield: 4.3 },
    ];
    const result = parseYieldPoints(points);
    expect(result).toHaveLength(2);
    expect(result[0]!.maturity).toBe("2Y");
    expect(result[1]!.maturity).toBe("10Y");
  });

  test("returns empty for all nulls", () => {
    expect(parseYieldPoints([{ maturity: "2Y", maturityYears: 2, yield: null }])).toEqual([]);
  });
});

describe("isInverted", () => {
  test("detects inverted curve (2Y > 10Y)", () => {
    const points: YieldPoint[] = [
      { maturity: "2Y", maturityYears: 2, yield: 5.0 },
      { maturity: "10Y", maturityYears: 10, yield: 4.3 },
    ];
    expect(isInverted(points)).toBe(true);
  });

  test("normal curve is not inverted", () => {
    const points: YieldPoint[] = [
      { maturity: "2Y", maturityYears: 2, yield: 4.0 },
      { maturity: "10Y", maturityYears: 10, yield: 4.5 },
    ];
    expect(isInverted(points)).toBe(false);
  });

  test("returns false when data is missing", () => {
    expect(isInverted([])).toBe(false);
    expect(isInverted([{ maturity: "2Y", maturityYears: 2, yield: 4.0 }])).toBe(false);
  });
});

describe("TREASURY_MATURITIES", () => {
  test("has 10 maturities in ascending order", () => {
    expect(TREASURY_MATURITIES).toHaveLength(10);
    for (let i = 1; i < TREASURY_MATURITIES.length; i++) {
      expect(TREASURY_MATURITIES[i]!.years).toBeGreaterThan(TREASURY_MATURITIES[i - 1]!.years);
    }
  });
});
