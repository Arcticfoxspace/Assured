// src/lib/server/ai/stats.ts — server only. Counters only: no message text, no locations, no IPs.
// Per server instance and in memory, so they reset on deploy/cold start. Shown on /api/status.
const g = globalThis as unknown as { __mewviStats?: Record<string, number> };

export function bump(name: string, by = 1): void {
  const s = (g.__mewviStats ??= {});
  s[name] = (s[name] ?? 0) + by;
}

export function snapshot(): Record<string, number> {
  return { ...(g.__mewviStats ?? {}) };
}

/** Tests only. */
export function resetStats(): void {
  g.__mewviStats = {};
}
