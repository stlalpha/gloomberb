import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createThrottledFetch } from "../../../utils/throttled-fetch";
import type { EconEvent, EconImpact } from "./types";

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const DISK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const calendarClient = createThrottledFetch({
  requestsPerMinute: 5,
  maxRetries: 2,
  timeoutMs: 15_000,
  defaultHeaders: {
    "User-Agent": "Gloomberb/0.4.1",
    Accept: "application/json",
  },
});

function getCachePath(): string {
  const dir = join(process.env.HOME || "~", ".gloomberb", "cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "econ-calendar.json");
}

function readDiskCache(): { data: unknown; fetchedAt: number } | null {
  try {
    const raw = readFileSync(getCachePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.fetchedAt && Array.isArray(parsed?.data)) return parsed;
  } catch { /* no cache or corrupt */ }
  return null;
}

function writeDiskCache(data: unknown, fetchedAt: number): void {
  try {
    writeFileSync(getCachePath(), JSON.stringify({ data, fetchedAt }));
  } catch { /* ignore write failures */ }
}

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CAD: "CA",
  AUD: "AU", CHF: "CH", CNY: "CN", NZD: "NZ", SEK: "SE",
  All: "--",
};

function resolveCountry(currency: string): string {
  return CURRENCY_TO_COUNTRY[currency] ?? currency.slice(0, 2);
}

function resolveImpact(raw: string): EconImpact {
  const lower = raw.toLowerCase();
  if (lower === "high") return "high";
  if (lower === "medium") return "medium";
  return "low";
}

interface RawCalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

export function parseCalendarJson(data: unknown): EconEvent[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((entry: any) => entry?.title && entry?.date)
    .filter((entry: any) => entry.impact !== "Holiday")
    .map((entry: any, idx: number): EconEvent => {
      const raw = entry as RawCalendarEvent;
      const date = new Date(raw.date);
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const time = `${hours}:${minutes}`;

      return {
        id: `ff-${idx}`,
        date,
        time,
        country: resolveCountry(raw.country),
        event: raw.title,
        actual: null, // ForexFactory this-week feed doesn't include actuals
        forecast: raw.forecast || null,
        prior: raw.previous || null,
        impact: resolveImpact(raw.impact),
      };
    });
}

export async function fetchEconCalendar(): Promise<EconEvent[]> {
  // Try disk cache first
  const cached = readDiskCache();
  if (cached && Date.now() - cached.fetchedAt < DISK_CACHE_TTL_MS) {
    return parseCalendarJson(cached.data);
  }

  try {
    const data = await calendarClient.fetchJson(CALENDAR_URL);
    writeDiskCache(data, Date.now());
    return parseCalendarJson(data);
  } catch (err) {
    // If fetch fails but we have stale cache, use it
    if (cached) {
      return parseCalendarJson(cached.data);
    }
    throw err;
  }
}
