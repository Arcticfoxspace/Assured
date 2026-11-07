import { serverEnv } from "@/lib/env";
import { channels } from "@/lib/server/notify";
import { storageMode } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { agentMode } from "@/lib/server/mewviAgent";
import { configuredProviders, dailyBudget } from "@/lib/server/ai/router";
import { snapshot } from "@/lib/server/ai/stats";

export const dynamic = "force-dynamic";

/** Tells the UI exactly which backend pieces exist, so it never over-claims. */
export async function GET(req: Request) {
  // U5: usage counters (e.g. how often the danger gate fired) are only shown to the owner, who sends x-status-key.
  const key = process.env.STATUS_KEY;
  const owner = Boolean(key) && req.headers.get("x-status-key") === key;
  return json({
    storage: storageMode(), // "supabase" | "memory" (dev only) | "none"
    routing: Boolean(serverEnv.orsKey()),
    // Delivery channels ASSURED can actually use to alert a guardian —
    // true only when the provider's keys are set. Push is not built.
    notifications: { ...channels(), push: false },
    scheduler: Boolean(process.env.CRON_SECRET),
    // Mewvi always works on its built-in rules; the agent is an optional layer on top.
    assistant: {
      // Agent mode, which free providers are configured (ids only — never keys), and counters. No message content.
      agent: { mode: agentMode(), providers: configuredProviders().map((p) => p.id), dailyBudget: dailyBudget(), ...(owner ? { counters: snapshot() } : {}) },
    },
  });
}
