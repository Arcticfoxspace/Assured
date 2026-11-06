// src/lib/mewvi/agent/schema.ts — the plan a model may return, and the strict parser for it.
//
// Rejects, never repairs: an unknown tool, an unknown or extra argument, more than three steps,
// or anything that isn't one JSON object makes the whole plan invalid and Mewvi falls back to V1.
import { z } from "zod";
import { REGISTRY } from "./registry";

export const MAX_STEPS = 3;
export const CLARIFY_IDS = ["need_topic", "need_detail"] as const;
export type ClarifyId = (typeof CLARIFY_IDS)[number];

/** Fixed questions: the model picks an id, we supply the words. */
export const CLARIFY_TEXT: Record<ClarifyId, string> = {
  need_topic: "Could you tell me a little more? For example, is this about money or online fraud, a hacked account, a lost phone, or something else?",
  need_detail: "I want to point you to the right place. Could you say a bit more about what you need?",
};

const step = <N extends keyof typeof REGISTRY>(name: N) => z.object({ tool: z.literal(name), args: REGISTRY[name].args }).strict();

export const PlanSchema = z
  .object({
    v: z.literal(1),
    steps: z.array(
      z.discriminatedUnion("tool", [
        step("search_resources"),
        step("get_helplines"),
        step("navigate"),
        step("get_checklist"),
        step("prepare_draft"),
        step("propose_call"),
        step("propose_share_location"),
        step("propose_check_in"),
      ])
    ).max(MAX_STEPS),
    clarify: z.enum(CLARIFY_IDS).nullable().optional(),
  })
  .strict();

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = Plan["steps"][number];

export type ParsedPlan = { ok: true; plan: Plan } | { ok: false };

export function parsePlan(raw: string): ParsedPlan {
  if (typeof raw !== "string" || raw.length > 4000) return { ok: false };
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    return { ok: false };
  }
  const r = PlanSchema.safeParse(obj);
  return r.success ? { ok: true, plan: r.data } : { ok: false };
}
