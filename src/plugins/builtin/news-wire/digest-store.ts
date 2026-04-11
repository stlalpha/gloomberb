import type { PluginPersistence } from "../../../types/plugin";

const CACHE_POLICY = {
  staleMs: 7 * 86_400_000,   // 7 days
  expireMs: 30 * 86_400_000, // 30 days
};

const cache = new Map<string, string>();
const inFlight = new Set<string>();
let persist: PluginPersistence | null = null;

export function setDigestPersistence(p: PluginPersistence): void {
  persist = p;
}

export function getDigest(articleId: string): string | null {
  const cached = cache.get(articleId);
  if (cached !== undefined) return cached;

  if (!persist) return null;
  const res = persist.getResource<string>("ai-digest", articleId, { allowExpired: false });
  if (res) {
    cache.set(articleId, res.value);
    return res.value;
  }
  return null;
}

export function setDigest(articleId: string, digest: string): void {
  cache.set(articleId, digest);
  persist?.setResource("ai-digest", articleId, digest, { cachePolicy: CACHE_POLICY });
}

export function isDigestInFlight(articleId: string): boolean {
  return inFlight.has(articleId);
}

export function markDigestInFlight(articleId: string): void {
  inFlight.add(articleId);
}

export function clearDigestInFlight(articleId: string): void {
  inFlight.delete(articleId);
}
