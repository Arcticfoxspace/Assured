// src/lib/mewvi/agent/executor.ts — runs a validated plan, and checks what actually came back.
//
// Guarantees: every call re-validates its arguments against that tool's own schema; at most
// MAX_STEPS steps; the same tool+arguments is never run twice and no tool runs more than twice;
// each step and the whole plan have time limits; a result that is malformed, or a read tool that
// returns a confirmation, is rejected instead of being reported. Nothing a failed or rejected step
// produced reaches the reply.
import type { z } from "zod";
import type { Block, Confirmation, IntentId, ToolResult } from "../types";
import { REGISTRY, type ToolCtx, type ToolDef, type ToolName } from "./registry";
import { MAX_STEPS, type Plan } from "./schema";

const BLOCK_TYPES = new Set(["text", "notice", "steps", "helplines", "links", "path", "places", "draft"]);
const CONFIRM_KINDS = new Set(["call", "share-location", "start-check-in"]);
const MAX_PER_TOOL = 2;

export interface ExecOptions {
  registry?: Record<string, ToolDef<z.ZodTypeAny>>;
  stepTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export interface StepOutcome {
  tool: string;
  intent: IntentId;
  result: ToolResult;
}

export interface ExecResult {
  outcomes: StepOutcome[];
  /** Reasons for steps that were refused or failed (tool names and codes only — no user text). */
  rejected: string[];
}

/** True only for a well-formed result that respects the tool's risk class. */
export function verifyToolResult(risk: "read" | "propose", r: unknown): r is ToolResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<ToolResult>;
  if (typeof x.found !== "boolean" || !Array.isArray(x.blocks) || !Array.isArray(x.confirmations)) return false;
  if (x.blocks.length > 8 || x.confirmations.length > 2) return false;
  if (!x.blocks.every((b: Block) => b && typeof b === "object" && BLOCK_TYPES.has(b.type))) return false;
  if (!x.confirmations.every((c: Confirmation) => c && CONFIRM_KINDS.has(c.kind) && typeof c.href === "string" && typeof c.prompt === "string")) return false;
  if (risk === "read" && x.confirmations.length > 0) return false;
  return true;
}

async function withTimeout<T>(work: () => T | Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tool_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executePlan(plan: Plan, ctx: ToolCtx, opts: ExecOptions = {}): Promise<ExecResult> {
  const registry = (opts.registry ?? REGISTRY) as Record<string, ToolDef<z.ZodTypeAny>>;
  const stepMs = opts.stepTimeoutMs ?? 300;
  const deadline = Date.now() + (opts.totalTimeoutMs ?? 1000);
  const outcomes: StepOutcome[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const perTool = new Map<string, number>();

  for (const step of plan.steps.slice(0, MAX_STEPS)) {
    const name = String(step.tool);
    const tool = Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;
    if (!tool) {
      rejected.push(`unknown_tool:${name}`);
      continue;
    }
    const sig = `${name}:${JSON.stringify(step.args)}`;
    if (seen.has(sig) || (perTool.get(name) ?? 0) >= MAX_PER_TOOL) {
      rejected.push(`repeated:${name}`);
      continue;
    }
    seen.add(sig);
    perTool.set(name, (perTool.get(name) ?? 0) + 1);

    const args = tool.args.safeParse(step.args);
    if (!args.success) {
      rejected.push(`bad_args:${name}`);
      continue;
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      rejected.push(`deadline:${name}`);
      continue;
    }
    try {
      const result = await withTimeout(() => tool.run(args.data, ctx), Math.min(stepMs, left));
      if (!verifyToolResult(tool.risk, result)) {
        rejected.push(`bad_result:${name}`);
        continue;
      }
      outcomes.push({ tool: name, intent: tool.intent(args.data), result });
    } catch (e) {
      rejected.push(`${e instanceof Error && e.message === "tool_timeout" ? "timeout" : "error"}:${name}`);
    }
  }
  return { outcomes, rejected };
}

export type { ToolName };
