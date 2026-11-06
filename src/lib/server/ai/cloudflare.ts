// src/lib/server/ai/cloudflare.ts — server only. Cloudflare Workers AI over its REST API.
//
// Free plan: a daily allowance of "Neurons" that resets at 00:00 UTC; past it Cloudflare returns
// an error (it does not bill the Free plan). The token and account id are read only on the server.
// Needs: CF_ACCOUNT_ID and CF_AI_TOKEN (a token scoped to Workers AI only). CF_AI_MODEL is optional.
import { serverEnv } from "@/lib/env";
import { retryAfterMs, timedFetch, type FailureKind, type GenerateResult, type ModelProvider } from "./types";

export const CF_DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

const ACCOUNT_RE = /^[A-Za-z0-9]{16,64}$/;
const MODEL_RE = /^@(?:cf|hf)\/[A-Za-z0-9._\-/]{3,120}$/;

/** Workers AI has returned a few shapes over time; accept the known ones, reject everything else. */
export function extractCloudflareText(data: unknown): string | undefined {
  const result = (data as { result?: unknown } | null)?.result as Record<string, unknown> | undefined;
  if (!result || typeof result !== "object") return undefined;
  const r = result.response;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") return JSON.stringify(r); // JSON-mode style: already parsed
  const choices = result.choices as { message?: { content?: unknown } }[] | undefined;
  const c = choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (typeof result.output_text === "string") return result.output_text;
  return undefined;
}

export function classifyCloudflareFailure(status: number, body: string): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return /allocation|neuron|daily|quota/i.test(body) ? "quota" : "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "unavailable";
}

export function cloudflareProvider(fetchImpl: typeof fetch = fetch): ModelProvider | undefined {
  const account = serverEnv.cfAccountId()?.trim();
  const token = serverEnv.cfAiToken()?.trim();
  const model = (serverEnv.cfAiModel()?.trim() || CF_DEFAULT_MODEL);
  // A malformed value means "not configured" — never build a URL from unchecked input.
  if (!account || !token || !ACCOUNT_RE.test(account) || !MODEL_RE.test(model)) return undefined;
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;

  return {
    id: "cloudflare",
    async generateJson({ system, input, maxTokens, timeoutMs, signal }): Promise<GenerateResult> {
      const sent = await timedFetch(
        fetchImpl,
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
            max_tokens: maxTokens,
            temperature: 0,
          }),
        },
        timeoutMs,
        signal
      );
      if (!sent.ok) return { ok: false, kind: sent.kind };
      const { res } = sent;
      const raw = await res.text().catch(() => "");
      if (!res.ok) return { ok: false, kind: classifyCloudflareFailure(res.status, raw), retryAfterMs: retryAfterMs(res) };
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, kind: "unavailable" };
      }
      if ((data as { success?: unknown })?.success === false) return { ok: false, kind: classifyCloudflareFailure(429, raw) === "quota" ? "quota" : "unavailable" };
      const text = extractCloudflareText(data);
      return text ? { ok: true, text } : { ok: false, kind: "unavailable" };
    },
  };
}
