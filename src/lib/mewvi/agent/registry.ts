// src/lib/mewvi/agent/registry.ts
//
// The ONLY things the agent can do. Each tool has a strict argument schema and returns a
// ToolResult built from ASSURED's verified data. Two risk classes:
//   read    – looks something up. Never returns a confirmation.
//   propose – may only return a Confirmation (a card the person must tap Yes on). It cannot
//             call, share a location or start a check-in; it can only offer to open the page.
// Every tool here is pure and local: no network, no storage, no personal data. A model chooses a
// tool name and arguments; it never supplies text, numbers or links.
import { z } from "zod";
import { isDialable, nationalHelplines } from "@/lib/helplines";
import { routes } from "@/lib/navigation";
import { CATEGORIES, categoryLabel, checklistFor } from "@/lib/evidence/model";
import { FLOWS } from "../flows";
import { refsFor, routeLink } from "../catalog";
import { callConfirmation, navigateTo, searchCyberResources, searchHelplines, searchTravelTools, searchWomenResources, shareLocation, startCheckIn } from "../tools";
import { TOPIC_IDS, type Block, type IntentId, type ToolResult } from "../types";
import { buildDraft, DRAFT_KINDS } from "./drafts";

export interface ToolCtx {
  /** True when a journey is running on the person's device. Never contains a location. */
  activeJourney: boolean;
}

const tuple = <T extends string>(xs: readonly T[]) => xs as unknown as [T, ...T[]];

export const ROUTE_IDS = tuple(routes.map((r) => r.id));
export const CATEGORY_IDS = tuple(CATEGORIES.map((c) => c.id));
export const DIALABLE_IDS = tuple(nationalHelplines.filter(isDialable).map((h) => h.id));
/** Situation checklists exclude the sensitive flows (followed, harassment, unsafe ride): those never involve a model. */
export const CHECKLIST_FLOWS = ["flow_financial_fraud", "flow_hacked_account", "flow_lost_phone", "flow_suspicious_message", "flow_scam_call"] as const;

const text = (t: string): Block => ({ type: "text", text: t });
const noConfirm = (r: ToolResult): ToolResult => ({ ...r, confirmations: [] });

export interface ToolDef<S extends z.ZodTypeAny> {
  risk: "read" | "propose";
  /** One line shown to the planner. */
  usage: string;
  args: S;
  /** The intent a reply built mainly from this tool is reported as. */
  intent: (a: z.infer<S>) => IntentId;
  run: (a: z.infer<S>, ctx: ToolCtx) => ToolResult;
}
const def = <S extends z.ZodTypeAny>(d: ToolDef<S>): ToolDef<S> => d;

export const REGISTRY = {
  search_resources: def({
    risk: "read",
    usage: 'search_resources {"domain":"cyber|women|travel","query":"optional keywords"} — ASSURED guides and tools for that area',
    args: z.object({ domain: z.enum(["cyber", "women", "travel"]), query: z.string().max(120).optional() }).strict(),
    intent: () => "navigate",
    run: ({ domain, query }) => noConfirm(domain === "cyber" ? searchCyberResources(query) : domain === "women" ? searchWomenResources(query) : searchTravelTools(query)),
  }),

  get_helplines: def({
    risk: "read",
    usage: `get_helplines {"topic":"${TOPIC_IDS.join("|")}"} — verified national helplines for a topic`,
    args: z.object({ topic: z.enum(TOPIC_IDS) }).strict(),
    intent: () => "helpline_search",
    run: ({ topic }) => noConfirm(searchHelplines({ topic })),
  }),

  navigate: def({
    risk: "read",
    usage: `navigate {"target":"<page id>"} — a link to an ASSURED page. Page ids: ${ROUTE_IDS.join(", ")}`,
    args: z.object({ target: z.enum(ROUTE_IDS) }).strict(),
    intent: () => "navigate",
    run: ({ target }) => noConfirm(navigateTo(target)),
  }),

  get_checklist: def({
    risk: "read",
    usage: `get_checklist {"kind":"evidence","category":"${CATEGORY_IDS.join("|")}"} or {"kind":"steps","flow":"${CHECKLIST_FLOWS.join("|")}"} — what to keep, or what to do`,
    args: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("evidence"), category: z.enum(CATEGORY_IDS) }).strict(),
      z.object({ kind: z.literal("steps"), flow: z.enum(CHECKLIST_FLOWS) }).strict(),
    ]),
    intent: (a) => (a.kind === "evidence" ? "evidence" : a.flow),
    run: (a): ToolResult => {
      if (a.kind === "evidence") {
        const link = routeLink("evidence", `?category=${a.category}`);
        return {
          found: true,
          blocks: [
            { type: "steps", title: `What to keep: ${categoryLabel(a.category)}`, steps: checklistFor(a.category) },
            { type: "notice", tone: "info", text: "Keep these on your own device. This helps you stay organised; it doesn't make anything legally admissible." },
            ...(link ? [{ type: "links", items: [link] } as Block] : []),
          ],
          confirmations: [],
        };
      }
      const flow = FLOWS[a.flow];
      if (!flow) return { found: false, blocks: [text("I don't have a checklist for that.")], confirmations: [] };
      const blocks: Block[] = [text(flow.lead), { type: "steps", title: flow.title, steps: flow.steps }];
      const refs = refsFor(flow.helplineIds, 2);
      if (refs.length) blocks.push({ type: "helplines", items: refs });
      const items = flow.links.map((l) => routeLink(l.routeId, l.suffix, l.label)).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (items.length) blocks.push({ type: "links", items });
      return { found: true, blocks, confirmations: [] };
    },
  }),

  prepare_draft: def({
    risk: "read",
    usage: `prepare_draft {"kind":"${DRAFT_KINDS.join("|")}","topic":"optional topic"} — a fill-in-the-blanks message or report for the person to review`,
    args: z.object({ kind: z.enum(DRAFT_KINDS), topic: z.enum(TOPIC_IDS).optional() }).strict(),
    intent: () => "report",
    run: ({ kind, topic }) => ({ found: true, blocks: [buildDraft(kind, topic)], confirmations: [] }),
  }),

  propose_call: def({
    risk: "propose",
    usage: `propose_call {"helplineId":"<dialable helpline id>"} — offers a confirmation card to open the dialer. Ids: ${DIALABLE_IDS.join(", ")}`,
    args: z.object({ helplineId: z.enum(DIALABLE_IDS) }).strict(),
    intent: () => "helpline_search",
    run: ({ helplineId }) => {
      const c = callConfirmation(helplineId);
      return { found: Boolean(c), blocks: [], confirmations: c ? [c] : [] };
    },
  }),

  propose_share_location: def({
    risk: "propose",
    usage: "propose_share_location {} — offers a confirmation card to open the Share Location page",
    args: z.object({}).strict(),
    intent: () => "share_location",
    run: () => shareLocation(),
  }),

  propose_check_in: def({
    risk: "propose",
    usage: "propose_check_in {} — offers a confirmation card to open the Safety Check-In page",
    args: z.object({}).strict(),
    intent: () => "start_checkin",
    run: (_a, ctx) => startCheckIn(ctx.activeJourney),
  }),
};

export type ToolName = keyof typeof REGISTRY;
export const TOOL_NAMES = Object.keys(REGISTRY) as ToolName[];
