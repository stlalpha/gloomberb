import { useEffect, useRef, useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { PaneProps } from "../../../types/plugin";
import type { MarketNewsItem } from "../../../types/news-source";
import { colors } from "../../../theme/colors";
import { useBreakingNews } from "../../../news/hooks";
import { detectProviders, getAiProvider, resolveDefaultAiProviderId } from "../ai/providers";
import { runAiPrompt } from "../ai/runner";
import { getDigest, setDigest, isDigestInFlight, markDigestInFlight, clearDigestInFlight } from "./digest-store";

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const DIGEST_PROMPT = `You are a financial news wire editor. Condense this headline and summary into a single concise actionable bullet point for a professional trader. Include why it matters and potential market impact. Keep it under 120 characters. Respond with ONLY the bullet text, nothing else.

Headline: {title}
Summary: {summary}`;

function buildDigestPrompt(item: MarketNewsItem): string {
  return DIGEST_PROMPT
    .replace("{title}", item.title)
    .replace("{summary}", item.summary ?? item.title);
}

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function BreakingPane({ focused, width, height, close }: PaneProps) {
  const articles = useBreakingNews(20);
  const [digestVersion, setDigestVersion] = useState(0);
  const [lastRefresh] = useState(() => new Date());
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [spinFrame, setSpinFrame] = useState(0);

  // Detect AI provider on mount
  useEffect(() => {
    const providers = detectProviders();
    setAiAvailable(providers.some((p) => p.available));
  }, []);

  // Braille spinner — ticks only while AI is running
  useEffect(() => {
    if (!aiRunning) return;
    const id = setInterval(() => setSpinFrame((f) => (f + 1) % BRAILLE_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [aiRunning]);

  // Generate digests for articles that don't have one yet
  const processingRef = useRef(false);
  useEffect(() => {
    if (!aiAvailable || articles.length === 0) return;
    if (processingRef.current) return;

    const providerId = resolveDefaultAiProviderId();
    const provider = getAiProvider(providerId);
    if (!provider?.available) return;

    const toDigest = articles.filter((a) => !getDigest(a.id) && !isDigestInFlight(a.id));
    if (toDigest.length === 0) return;

    processingRef.current = true;
    setAiRunning(true);

    (async () => {
      for (const article of toDigest) {
        if (getDigest(article.id) || isDigestInFlight(article.id)) continue;
        markDigestInFlight(article.id);

        try {
          const result = await runAiPrompt({
            provider,
            prompt: buildDigestPrompt(article),
          }).done;

          const digest = result.trim().slice(0, 150);
          if (digest) {
            setDigest(article.id, digest);
            setDigestVersion((v) => v + 1);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Credit") || msg.includes("quota") || msg.includes("rate limit")) {
            setAiError(msg);
            break;
          }
        } finally {
          clearDigestInFlight(article.id);
        }
      }
      setAiRunning(false);
      processingRef.current = false;
    })();
  }, [aiAvailable, articles]);

  useKeyboard((event) => {
    if (!focused) return;
    if (event.name === "escape") {
      close?.();
    }
  });

  const timeW = 5;
  const bulletW = 2;
  const titleW = Math.max(10, width - bulletW - timeW - 3);

  if (articles.length === 0) {
    return (
      <box flexDirection="column" width={width} height={height}>
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <box flexDirection="column" alignItems="center" gap={1}>
            <text fg={colors.textDim}>No breaking news</text>
            <text fg={colors.textMuted}>Last checked: {formatTime(lastRefresh)}</text>
          </box>
        </box>
        <box height={1} paddingX={1}>
          <text fg={colors.textMuted}>Esc close</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <box height={1} paddingX={1} flexDirection="row">
        {aiAvailable && (
          <text fg={colors.textDim} attributes={TextAttributes.BOLD}>AI digest </text>
        )}
        {aiRunning && (
          <text fg={colors.positive}>{BRAILLE_FRAMES[spinFrame]} </text>
        )}
        <text fg={colors.textMuted}>{articles.length} stories</text>
      </box>

      <scrollbox flexGrow={1} scrollY focusable={false}>
        <box flexDirection="column">
          {articles.map((item) => {
            const timeStr = relativeTime(item.publishedAt).padStart(timeW);
            const digest = getDigest(item.id);
            const displayText = (digest ?? item.title).slice(0, titleW);
            const isDigested = !!digest;

            return (
              <box
                key={item.id}
                flexDirection="row"
                height={1}
                paddingX={1}
              >
                <box width={bulletW}>
                  <text fg={isDigested ? colors.positive : colors.textBright}>● </text>
                </box>
                <box flexGrow={1}>
                  <text fg={isDigested ? colors.text : colors.textDim}>{displayText}</text>
                </box>
                <box width={timeW}>
                  <text fg={colors.textDim}>{timeStr}</text>
                </box>
              </box>
            );
          })}
        </box>
      </scrollbox>
      <box height={1} paddingX={1}>
        <text fg={colors.textMuted}>
          {aiAvailable ? "● green = AI digest" : "Install claude/gemini CLI for AI digests"}
          {" · Esc close"}
        </text>
      </box>
    </box>
  );
}
