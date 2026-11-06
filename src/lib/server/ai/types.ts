// src/lib/server/ai/types.ts — server only. The one interface every model provider implements.
//
// A provider turns (system prompt, user input) into TEXT that is expected to be JSON. It knows
// nothing about Mewvi, tools or safety: that logic lives in src/lib/mewvi/agent and always
// validates whatever comes back. Adding or swapping a provider never touches the agent.

/** Only providers with a free plan are ever recognised. There is deliberately no paid adapter. */
export const FREE_PROVIDER_IDS = ["cloudflare", "ollama"] as const;
export type ProviderId = (typeof FREE_PROVIDER_IDS)[number];

export type FailureKind = "rate_limited" | "quota" | "auth" | "timeout" | "unavailable";

export interface GenerateRequest {
  system: string;
  input: string;
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type GenerateResult = { ok: true; text: string } | { ok: false; kind: FailureKind; retryAfterMs?: number };

export interface ModelProvider {
  id: ProviderId;
  generateJson(req: GenerateRequest): Promise<GenerateResult>;
}

/** Shared by the adapters: run fetch with a hard timeout and turn every failure into a FailureKind. */
export async function timedFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outer?: AbortSignal
): Promise<{ ok: true; res: Response } | { ok: false; kind: FailureKind }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter);
  try {
    const res = await fetchImpl(url, { ...init, cache: "no-store", signal: ctrl.signal });
    return { ok: true, res };
  } catch (e) {
    const aborted = ctrl.signal.aborted || (e instanceof Error && e.name === "AbortError");
    return { ok: false, kind: aborted ? "timeout" : "unavailable" };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}

export function retryAfterMs(res: Response): number | undefined {
  const v = res.headers.get("retry-after");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(n * 1000, 10 * 60_000) : undefined;
}
