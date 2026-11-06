import test from "node:test";
import assert from "node:assert/strict";
import { redactForModel } from "../src/lib/mewvi/text";

// U2 (session 5): best-effort masking of self-introduced names and address cues. Not a guarantee.
test("U2: names given with an introduction cue are masked", () => {
  for (const [raw, leaked] of [
    ["my name is Priya Sharma and someone is calling me", "Priya"],
    ["hi call me Rahul", "Rahul"],
    ["mera naam Sunita Devi hai aur mujhe dhamki mil rahi hai", "Sunita"],
    ["mera naam hai Amit", "Amit"],
  ] as const) assert.ok(!redactForModel(raw).includes(leaked), raw);
  assert.equal(redactForModel("my name is Priya and I need help"), "my name is [name] and I need help");
});

test("U2: house numbers and 'near <place> colony/road' cues are masked", () => {
  for (const [raw, leaked] of [
    ["I live in flat 402 sunrise apartments", "402"],
    ["house no 12/B gandhi nagar", "12/B"],
    ["he waits near Shanti Vihar every night", "Shanti"],
    ["opposite green park colony", "green"],
  ] as const) assert.ok(!redactForModel(raw).includes(leaked), raw);
});

test("U2: ordinary text is left alone", () => {
  for (const m of ["how do I report a scam call", "my name is a problem", "someone is near the road at night", "what is the women helpline number", "call me back help", "room for improvement"]) {
    const out = redactForModel(m);
    assert.ok(!out.includes("[name]"), m + " -> " + out);
    assert.ok(!out.includes("[address]"), m + " -> " + out);
  }
});
