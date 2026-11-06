// Prompt 5 audit regressions: each case here failed before the fix (see docs/PROMPT5_AUDIT_REPORT.md).
import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/lib/mewvi/intents";
import { agentGate } from "../src/lib/mewvi/agent/planner";
import { normalize, redactForModel } from "../src/lib/mewvi/text";

const gate = (m: string) => agentGate(normalize(m), classify(m, "home"), m);

test("audit F1: sensitive / unreadable messages never reach a model", () => {
  const blocked = [
    "my husband beats me",
    "i was drugged at a party",
    "i feel like giving up on everything",
    "bachao mujhe koi maar raha hai",
    "main marna chahta hu",
    "mujhe khudkushi ka mann hai",
    "मुझे बचाओ",
    "su​icide",
  ];
  for (const m of blocked) assert.equal(gate(m).use, false, m);
});

test("audit F1: an ordinary vague scam question still reaches the planner", () => {
  assert.equal(gate("I got a fake job offer asking for a registration fee").use, true);
});

test("audit F2: invisible characters and accents do not hide words", () => {
  assert.equal(normalize("su​icide"), "suicide");
  assert.equal(normalize("sûicide"), "suicide");
});

test("audit F3: UPI ids, PAN, OTPs and long digit runs are masked before a model sees them", () => {
  for (const [raw, leaked] of [
    ["I paid ramesh@oksbi 5000", "ramesh@oksbi"],
    ["my PAN is ABCDE1234F", "ABCDE1234F"],
    ["otp 482913 shared", "482913"],
    ["acct 123456789012", "123456789012"],
  ] as const) assert.ok(!redactForModel(raw).includes(leaked), raw);
});

test("audit U5/U6: public status hides counters; checklist tool no longer offers the model-free location flow", async () => {
  const { GET } = await import("../src/app/api/status/route");
  const prev = process.env.STATUS_KEY;
  try {
    process.env.STATUS_KEY = "k3y-test";
    const anon = (await (await GET(new Request("http://x/api/status"))).json()) as { assistant: { agent: Record<string, unknown> } };
    assert.equal("counters" in anon.assistant.agent, false);
    const bad = (await (await GET(new Request("http://x/api/status", { headers: { "x-status-key": "nope" } }))).json()) as { assistant: { agent: Record<string, unknown> } };
    assert.equal("counters" in bad.assistant.agent, false);
    const owner = (await (await GET(new Request("http://x/api/status", { headers: { "x-status-key": "k3y-test" } }))).json()) as { assistant: { agent: Record<string, unknown> } };
    assert.equal("counters" in owner.assistant.agent, true);
    delete process.env.STATUS_KEY;
    const unset = (await (await GET(new Request("http://x/api/status", { headers: { "x-status-key": "" } }))).json()) as { assistant: { agent: Record<string, unknown> } };
    assert.equal("counters" in unset.assistant.agent, false);
  } finally {
    if (prev === undefined) delete process.env.STATUS_KEY; else process.env.STATUS_KEY = prev;
  }
  const { CHECKLIST_FLOWS } = await import("../src/lib/mewvi/agent/registry");
  assert.equal((CHECKLIST_FLOWS as readonly string[]).includes("flow_unfamiliar_location"), false);
});
