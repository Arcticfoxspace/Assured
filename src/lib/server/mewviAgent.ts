// src/lib/server/mewviAgent.ts — server only. The agent's entry point.
//
//   message ─► V1 answer (always computed first: the fallback)
//           ─► gate (no model for danger / sensitive / confident messages)
//           ─► per-client + per-instance limits ─► provider router ─► strict plan parse
//           ─► executor (approved tools only) ─► composer ─► guard ─► reply
//
// Any failure anywhere returns the V1 reply. Modes: "shadow" runs the plan and records counters
// but still answers with V1; "on" answers with the agent. Neither logs message text.
import { serverEnv } from "@/lib/env";
import { pageContext } from "@/lib/mewvi/context";
import { classify } from "@/lib/mewvi/intents";
import { verifyReply } from "@/lib/mewvi/guard";
import { respond } from "@/lib/mewvi/respond";
import { normalize, sanitizeMessage } from "@/lib/mewvi/text";
import type { AiStatus, MewviReply, RespondInput } from "@/lib/mewvi/types";
import { composeAgentReply, composeClarify, type Composed } from "@/lib/mewvi/agent/compose";
import { executePlan } from "@/lib/mewvi/agent/executor";
import { agentGate, PLANNER_SYSTEM, plannerInput } from "@/lib/mewvi/agent/planner";
import { parsePlan } from "@/lib/mewvi/agent/schema";
import { callModels, configuredProviders, dailyBudget, noteInvalidOutput, noteValidOutput, type RouterOptions } from "@/lib/server/ai/router";
import { bump } from "@/lib/server/ai/stats";
import { rateLimit } from "@/lib/server/rateLimit";
import { clientHash, makeSharedLimiter, type SharedLimiter } from "@/lib/server/sharedLimit";

export type AgentMode = "off" | "shadow" | "on";

export function agentMode(): AgentMode {
  const m = serverEnv.agentMode();
  return m === "on" || m === "shadow" ? m : "off";
}

export interface AgentDeps {
  router?: RouterOptions;
  /** Identifies the caller for abuse limits. Counters only; never stored with content. */
  clientKey?: string;
  /** Shared (cross-instance) counter. Defaults to the Supabase-backed one; tests inject a fake. */
  shared?: SharedLimiter;
}

/** Per-client limits for model calls (the route already limits all requests). In memory, per instance. */
function allowModelCall(clientKey: string | undefined): boolean {
  if (!clientKey) return true;
  return rateLimit(`mewvi-ai-min:${clientKey}`, 8, 60_000) && rateLimit(`mewvi-ai-hr:${clientKey}`, 60, 3_600_000);
}

const defaultShared = makeSharedLimiter();

/**
 * Cross-instance limits: one deployment-wide daily budget and (when SHARE_TOKEN_SECRET is set) a per-client
 * hourly cap. Only an explicit "denied" blocks; "unavailable" keeps the in-memory limits as the guard.
 */
async function allowShared(shared: SharedLimiter, clientKey: string | undefined): Promise<boolean> {
  const checks = [shared("mewvi-day", dailyBudget(), 86_400_000)];
  const h = clientHash(clientKey);
  if (h) checks.push(shared(`mewvi-hr:${h}`, 60, 3_600_000));
  const results = await Promise.all(checks);
  if (results.includes("unavailable")) bump("shared_unavailable");
  if (results.includes("denied")) return false;
  if (results.includes("allowed")) bump("shared_ok");
  return true;
}

const asV1 = (v1: MewviReply, ai: AiStatus): MewviReply => ({ ...v1, ai });

export async function respondWithAgent(input: RespondInput, mode: Exclude<AgentMode, "off">, deps: AgentDeps = {}): Promise<MewviReply> {
  // V1 first, with no model attached. It is the answer whenever the agent doesn't produce a better one.
  const v1 = await respond(input);
  try {
    const message = sanitizeMessage(typeof input.message === "string" ? input.message : "");
    const ctx = pageContext(input.pathname);
    const local = classify(message, ctx.domain);
    const gate = agentGate(normalize(message), local, message);
    if (!gate.use) {
      bump(`gate_${gate.reason}`);
      return asV1(v1, "skipped");
    }
    if ((deps.router?.providers ?? configuredProviders()).length === 0) {
      bump("not_configured");
      return asV1(v1, "off");
    }
    if (!allowModelCall(deps.clientKey)) {
      bump("client_limited");
      return asV1(v1, "rate_limited");
    }

    if (!(await allowShared(deps.shared ?? defaultShared, deps.clientKey))) {
      bump("shared_limited");
      return asV1(v1, "rate_limited");
    }

    bump("attempted");
    const called = await callModels({ system: PLANNER_SYSTEM, input: plannerInput(message, ctx.pathname), maxTokens: 300 }, deps.router);
    if (!called.ok) return asV1(v1, called.reason);

    const parsed = parsePlan(called.text);
    if (!parsed.ok) {
      noteInvalidOutput(called.provider);
      bump("plan_invalid");
      return asV1(v1, "unavailable");
    }
    noteValidOutput(called.provider);
    const { plan } = parsed;

    let composed: Composed | undefined;
    if (plan.steps.length === 0) {
      if (plan.clarify) composed = composeClarify(plan.clarify, ctx);
      else {
        bump("plan_empty");
        return asV1(v1, "skipped");
      }
    } else {
      const exec = await executePlan(plan, { activeJourney: Boolean(input.activeJourney) });
      for (const r of exec.rejected) bump(`step_${r.split(":")[0]}`);
      composed = composeAgentReply(exec, ctx);
      if (!composed) {
        bump("no_result");
        return asV1(v1, "skipped");
      }
    }

    const draft: MewviReply = {
      intent: composed.intent,
      engine: "agent",
      ai: "ok",
      blocks: composed.blocks,
      confirmations: composed.confirmations,
      suggestions: composed.suggestions.filter((s, i, a) => a.indexOf(s) === i).slice(0, 3),
    };
    const checked = verifyReply(draft);
    // The guard should never need to remove anything from a reply built from verified tools. If it does, fail closed.
    if (checked.issues.length > 0) {
      bump("guard_rejected");
      return asV1(v1, "skipped");
    }
    if (mode === "shadow") {
      bump("shadow_ok");
      return asV1(v1, "skipped");
    }
    bump("agent_ok");
    return checked.reply;
  } catch {
    bump("agent_error");
    return asV1(v1, "unavailable");
  }
}
