// src/lib/mewvi/agent/drafts.ts — fixed templates for messages and reports the person reviews.
//
// Nothing here is written by a model. A model can only pick the template (kind) and topic; every
// word below is ours, every unknown is a [placeholder] the person fills in. Mewvi never sends it.
import type { Block, TopicId } from "../types";

export const DRAFT_KINDS = ["trusted_contact", "incident_report"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

const ONLINE_TOPICS: TopicId[] = ["cyber", "financial", "online-harassment", "hacked", "lost-phone"];

const NOTE = "This is a draft for you to review and edit. Mewvi has not sent or filed anything — you copy it and send or submit it yourself.";

function trustedContact(topic?: TopicId): Block {
  const online = topic !== undefined && ONLINE_TOPICS.includes(topic);
  const body = online
    ? [
        "Hi [name],",
        "",
        "Something happened to me online and I'd like you to know. In short: [one line about what happened].",
        "Please don't send money or share any codes for me, even if a message seems to come from me.",
        "Could you [call me / sit with me while I report it] when you're free?",
      ].join("\n")
    : [
        "Hi [name],",
        "",
        "I'm not feeling fully safe right now and I'd like you to be aware. I'm at [where you are] and heading to [where you're going].",
        "Could you call me, and stay on the phone if you can?",
        "If you don't hear from me by [time], please try calling me and then [another person you trust].",
      ].join("\n");
  return { type: "draft", title: "Message to a trusted person", body, note: NOTE };
}

function incidentReport(topic?: TopicId): Block {
  const extra: string[] = [];
  if (topic === "financial") extra.push("Amounts, dates and reference IDs of each transaction: [list them]", "Bank, card or UPI app involved: [name]");
  else if (topic === "lost-phone") extra.push("Phone make and model: [details]", "Phone IMEI, if you have it: [from the box or your records]");
  else if (topic !== undefined && ONLINE_TOPICS.includes(topic)) extra.push("Platform, account name or page address: [details]");
  const body = [
    "Summary: [one line describing what happened]",
    "",
    "What happened: [describe it in your own words, in the order it happened]",
    "When: [date and time, or your best estimate]",
    "Where: [place, website, app or phone number involved]",
    "People or accounts involved: [only what you know — don't guess]",
    ...extra,
    "What I have kept: [screenshots, messages, receipts, call logs]",
    "What I have done so far: [steps you've already taken]",
  ].join("\n");
  return { type: "draft", title: "Incident report draft", body, note: NOTE };
}

export function buildDraft(kind: DraftKind, topic?: TopicId): Block {
  return kind === "trusted_contact" ? trustedContact(topic) : incidentReport(topic);
}
