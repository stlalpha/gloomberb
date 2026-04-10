import { describe, expect, test } from "bun:test";
import { parseCalendarJson } from "./calendar-source";

const SAMPLE_DATA = [
  {
    title: "CPI m/m",
    country: "USD",
    date: "2026-04-10T08:30:00-04:00",
    impact: "High",
    forecast: "0.3%",
    previous: "0.2%",
  },
  {
    title: "ECB Rate Decision",
    country: "EUR",
    date: "2026-04-10T14:00:00-04:00",
    impact: "Medium",
    forecast: "4.50%",
    previous: "4.50%",
  },
  {
    title: "Bank Holiday",
    country: "GBP",
    date: "2026-04-10T03:00:00-04:00",
    impact: "Holiday",
    forecast: "",
    previous: "",
  },
];

describe("parseCalendarJson", () => {
  test("parses events from JSON, skips holidays", () => {
    const events = parseCalendarJson(SAMPLE_DATA);
    expect(events).toHaveLength(2);
  });

  test("maps fields correctly", () => {
    const events = parseCalendarJson(SAMPLE_DATA);
    const ev = events[0]!;
    expect(ev.event).toBe("CPI m/m");
    expect(ev.country).toBe("US");
    expect(ev.impact).toBe("high");
    expect(ev.forecast).toBe("0.3%");
    expect(ev.prior).toBe("0.2%");
    expect(ev.time).toMatch(/^\d{2}:\d{2}$/);
  });

  test("resolves EUR to EU country code", () => {
    const events = parseCalendarJson(SAMPLE_DATA);
    expect(events[1]!.country).toBe("EU");
    expect(events[1]!.impact).toBe("medium");
  });

  test("returns empty forecast/prior as null", () => {
    const events = parseCalendarJson([
      { title: "Test", country: "USD", date: "2026-04-10T10:00:00-04:00", impact: "Low", forecast: "", previous: "" },
    ]);
    expect(events[0]!.forecast).toBeNull();
    expect(events[0]!.prior).toBeNull();
  });

  test("returns [] for non-array input", () => {
    expect(parseCalendarJson(null)).toEqual([]);
    expect(parseCalendarJson({})).toEqual([]);
    expect(parseCalendarJson("")).toEqual([]);
  });
});
