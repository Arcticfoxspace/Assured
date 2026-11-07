// src/lib/env.ts
//
// Central place to read environment variables. Never read
// process.env directly elsewhere — import from here so it's obvious
// which values are public and which are server-only.

export const publicEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ASSURED",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

/**
 * Server-only environment variables. Importing this file from a
 * "use client" component will fail at build time if any of these are
 * ever accessed on the client, which is the intended safety net.
 */
export const serverEnv = {
  // Read lazily (functions) so values are picked up at request time.
  supabaseUrl: () => process.env.SUPABASE_URL,
  supabaseKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY,
  orsKey: () => process.env.ORS_API_KEY,
  tokenSecret: () => process.env.SHARE_TOKEN_SECRET ?? "",
  onVercel: () => Boolean(process.env.VERCEL),

  // ---- Mewvi agent (all optional; unset = the agent is simply off) ----
  /** off (default) | shadow (plan but still answer with V1) | on. */
  agentMode: () => (process.env.MEWVI_AGENT ?? "off").trim().toLowerCase(),
  /** Comma-separated provider order, e.g. "cloudflare,ollama". Only free providers are recognised. */
  agentProviders: () => process.env.MEWVI_PROVIDERS ?? "cloudflare,ollama",
  /** Max model calls per day per server instance. */
  agentDailyBudget: () => process.env.MEWVI_DAILY_BUDGET,
  cfAccountId: () => process.env.CF_ACCOUNT_ID,
  cfAiToken: () => process.env.CF_AI_TOKEN,
  cfAiModel: () => process.env.CF_AI_MODEL,
  ollamaKey: () => process.env.OLLAMA_API_KEY,
  ollamaModel: () => process.env.OLLAMA_MODEL,
};
