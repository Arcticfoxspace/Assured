// src/lib/mewvi/agent/compose.ts — turns verified tool outcomes into a reply.
//
// All wording here is fixed. Blocks come from the tools (verified data). The text never says an
// action happened: calls, sharing and check-ins are only ever offered through confirmation cards,
// and drafts are labelled as not sent.
import { contextSuggestions, type PageContext } from "../context";
import type { Block, Confirmation, IntentId, MewviReply } from "../types";
import type { ExecResult } from "./executor";
import { CLARIFY_TEXT, type ClarifyId } from "./schema";

const key = (b: Block) => JSON.stringify(b);

export interface Composed {
  intent: IntentId;
  blocks: Block[];
  confirmations: Confirmation[];
  suggestions: string[];
}

/** Returns undefined when no step found anything: the caller then answers with V1 instead. */
export function composeAgentReply(exec: ExecResult, ctx: PageContext): Composed | undefined {
  const good = exec.outcomes.filter((o) => o.result.found);
  if (good.length === 0) return undefined;

  const blocks: Block[] = [{ type: "text", text: "Here's what I found in ASSURED's verified information." }];
  const seen = new Set<string>();
  const confirmations: Confirmation[] = [];
  for (const o of exec.outcomes) {
    for (const b of o.result.blocks) {
      const k = key(b);
      if (!seen.has(k)) {
        seen.add(k);
        blocks.push(b);
      }
    }
    for (const c of o.result.confirmations) if (!confirmations.some((x) => x.id === c.id)) confirmations.push(c);
  }
  if (exec.rejected.length > 0 || exec.outcomes.some((o) => !o.result.found)) {
    blocks.push({ type: "notice", tone: "info", text: "I couldn't complete part of that, so I've left it out rather than guess." });
  }
  if (blocks.some((b) => b.type === "helplines" || b.type === "links")) {
    blocks.push({ type: "notice", tone: "info", text: "If you need help right now, don't search — call 112." });
  }
  return {
    intent: good[0].intent,
    blocks,
    confirmations: confirmations.slice(0, 2),
    suggestions: good.flatMap((o) => o.result.suggestions ?? []).concat(contextSuggestions(ctx.domain)),
  };
}

export function composeClarify(id: ClarifyId, ctx: PageContext): Composed {
  return { intent: "about", blocks: [{ type: "text", text: CLARIFY_TEXT[id] }], confirmations: [], suggestions: contextSuggestions(ctx.domain) };
}

export type { MewviReply };
