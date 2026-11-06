// src/lib/server/ai/ollama.ts — server only. Ollama Cloud (hosted) over its native chat API.
//
// Free plan = "light usage", capped per 5-hour session and per week, one cloud model at a time
// (extra requests queue). Needs OLLAMA_API_KEY and an explicit OLLAMA_MODEL: which models a free
// account may use is not published, so there is no default to guess at.
import { serverEnv } from "@/lib/env";
import { retryAfterMs, timedFetch, type FailureKind, type GenerateResult, type ModelProvider } from "./types";

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{1,100}$/;
const URL_CHAT = "https://ollama.com/api/chat";

export function classifyOllamaFailure(status: number): FailureKind {
  if (status === 401) return "auth";
  // 402/403 usually mean "this model needs a paid plan". We never upgrade: treat as unusable for a while.
  if (status === 402 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "unavailable";
}

export function ollamaProvider(fetchImpl: typeof fetch = fetch): ModelProvider | undefined {
  const key = serverEnv.ollamaKey()?.trim();
  const model = serverEnv.ollamaModel()?.trim();
  if (!key || !model || !MODEL_RE.test(model)) return undefined;

  return {
    id: "ollama",
    async generateJson({ system, input, maxTokens, timeoutMs, signal }): Promise<GenerateResult> {
      const sent = await timedFetch(
        fetchImpl,
        URL_CHAT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
            options: { temperature: 0, num_predict: maxTokens },
          }),
        },
        timeoutMs,
        signal
      );
      if (!sent.ok) return { ok: false, kind: sent.kind };
      const { res } = sent;
      if (!res.ok) return { ok: false, kind: classifyOllamaFailure(res.status), retryAfterMs: retryAfterMs(res) };
      try {
        const data = (await res.json()) as { message?: { content?: unknown } };
        const text = data?.message?.content;
        return typeof text === "string" && text ? { ok: true, text } : { ok: false, kind: "unavailable" };
      } catch {
        return { ok: false, kind: "unavailable" };
      }
    },
  };
}
