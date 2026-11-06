// src/lib/server/ai/router.ts — server only. Picks a model provider for one call.
//
// Rules this file enforces:
//  - Only providers in FREE_PROVIDER_IDS are ever used. There is no paid adapter to fall over to,
//    and a "needs a paid plan" answer from a provider just puts that provider on cooldown.
//  - A provider that fails is skipped for a while (circuit breaker) instead of slowing every message.
//  - A per-instance daily call budget and an in-flight cap stop a burst from draining a free quota.
//  - Nothing here logs prompts or answers.
import { serverEnv } from "@/lib/env";
import type { AiStatus } from "@/lib/mewvi/types";
import { cloudflareProvider } from "./cloudflare";
import { ollamaProvider } from "./ollama";
import { bump } from "./stats";
import { FREE_PROVIDER_IDS, type FailureKind, type GenerateRequest, type ModelProvider, type ProviderId } from "./types";

const MAX_INFLIGHT = 4;
const DEFAULT_BUDGET = 300;
const PER_ATTEMPT_MS = 3000;
const MIN_ATTEMPT_MS = 800;
const INVALID_STREAK_LIMIT = 5;

interface State {
  cooldown: Partial<Record<ProviderId, { until: number; kind: FailureKind }>>;
  invalid: Partial<Record<ProviderId, number>>;
  day: string;
  used: number;
  inflight: number;
}
const g = globalThis as unknown as { __mewviAi?: State };
const state = (): State => (g.__mewviAi ??= { cooldown: {}, invalid: {}, day: "", used: 0, inflight: 0 });

/** Tests only. */
export function resetRouterState() {
  g.__mewviAi = undefined;
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const msToUtcMidnight = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t;
};

export function dailyBudget(): number {
  const raw = serverEnv.agentDailyBudget();
  if (raw === undefined || raw.trim() === "") return DEFAULT_BUDGET;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 100_000)) : DEFAULT_BUDGET;
}

/** The configured providers, in the configured order. Unknown ids are ignored (so a paid name cannot be added). */
export function configuredProviders(fetchImpl: typeof fetch = fetch): ModelProvider[] {
  const wanted = serverEnv
    .agentProviders()
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderId => (FREE_PROVIDER_IDS as readonly string[]).includes(s));
  const out: ModelProvider[] = [];
  for (const id of new Set(wanted)) {
    const p = id === "cloudflare" ? cloudflareProvider(fetchImpl) : ollamaProvider(fetchImpl);
    if (p) out.push(p);
  }
  return out;
}

const statusFor = (k: FailureKind): AiStatus => (k === "auth" ? "invalid_key" : k === "rate_limited" || k === "quota" ? "rate_limited" : "unavailable");

function cooldownFor(id: ProviderId, kind: FailureKind, retryAfter: number | undefined, now: number): number {
  switch (kind) {
    case "auth":
      return 10 * 60_000;
    case "quota":
      return id === "cloudflare" ? msToUtcMidnight(now) : 30 * 60_000;
    case "rate_limited":
      return Math.max(5_000, Math.min(retryAfter ?? 60_000, 10 * 60_000));
    default:
      return 15_000;
  }
}

/** The agent calls this when a provider's answer passed validation: the invalid streak starts over. */
export function noteValidOutput(id: ProviderId): void {
  state().invalid[id] = 0;
}

/** The agent calls this when a provider answered but the answer failed validation. A broken model gets paused. */
export function noteInvalidOutput(id: ProviderId, now = Date.now()): void {
  const s = state();
  s.invalid[id] = (s.invalid[id] ?? 0) + 1;
  if ((s.invalid[id] ?? 0) >= INVALID_STREAK_LIMIT) {
    s.cooldown[id] = { until: now + 5 * 60_000, kind: "unavailable" };
    s.invalid[id] = 0;
  }
}

export type RouterResult = { ok: true; text: string; provider: ProviderId } | { ok: false; reason: AiStatus };

export interface RouterOptions {
  providers?: ModelProvider[];
  now?: () => number;
  /** Total time allowed across all attempts. */
  deadlineMs?: number;
}

export async function callModels(req: Omit<GenerateRequest, "timeoutMs" | "signal">, opts: RouterOptions = {}): Promise<RouterResult> {
  const now = opts.now ?? Date.now;
  const providers = opts.providers ?? configuredProviders();
  if (providers.length === 0) return { ok: false, reason: "off" };

  const s = state();
  const t0 = now();
  if (s.day !== utcDay(t0)) {
    s.day = utcDay(t0);
    s.used = 0;
  }
  if (s.inflight >= MAX_INFLIGHT) {
    bump("busy");
    return { ok: false, reason: "rate_limited" };
  }

  const deadline = t0 + (opts.deadlineMs ?? 4500);
  let last: AiStatus = "unavailable";
  s.inflight++;
  try {
    for (const p of providers) {
      const cd = s.cooldown[p.id];
      if (cd && t0 < cd.until) {
        last = statusFor(cd.kind);
        continue;
      }
      if (s.used >= dailyBudget()) {
        bump("budget_exhausted");
        return { ok: false, reason: "rate_limited" };
      }
      const remaining = deadline - now();
      if (remaining < MIN_ATTEMPT_MS) break;
      s.used++;
      bump(`call_${p.id}`);
      let out;
      try {
        out = await p.generateJson({ ...req, timeoutMs: Math.min(PER_ATTEMPT_MS, remaining) });
      } catch {
        out = { ok: false as const, kind: "unavailable" as const };
      }
      if (out.ok) {
        // Whether the answer is any good is decided by the agent (noteValidOutput / noteInvalidOutput).
        return { ok: true, text: out.text, provider: p.id };
      }
      bump(`fail_${p.id}_${out.kind}`);
      s.cooldown[p.id] = { until: now() + cooldownFor(p.id, out.kind, out.retryAfterMs, now()), kind: out.kind };
      last = statusFor(out.kind);
    }
    return { ok: false, reason: last };
  } finally {
    s.inflight--;
  }
}
