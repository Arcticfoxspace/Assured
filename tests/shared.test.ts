// Part C: shared (cross-instance) limiter. Fake network only — no live Supabase was used.
import test from "node:test";
import assert from "node:assert/strict";
import { clientHash, makeSharedLimiter, type SharedLimiter, type SharedResult } from "../src/lib/server/sharedLimit";
import { respondWithAgent } from "../src/lib/server/mewviAgent";
import { resetRouterState } from "../src/lib/server/ai/router";
import { resetStats, snapshot } from "../src/lib/server/ai/stats";
import type { GenerateRequest, ModelProvider } from "../src/lib/server/ai/types";

const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SHARE_TOKEN_SECRET", "MEWVI_DAILY_BUDGET", "MEWVI_AGENT", "CF_ACCOUNT_ID", "CF_AI_TOKEN"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const run = (fn: () => Promise<void> | void) => async () => {
  for (const k of KEYS) delete process.env[k];
  resetRouterState();
  resetStats();
  try { await fn(); } finally {
    for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    resetRouterState();
    resetStats();
  }
};
const withDb = () => {
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-test";
};
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

const VAGUE = "I got a fake job offer asking for a registration fee";
const SECRET = "a-test-secret-of-16+chars";
function provider(spy: { n: number }): ModelProvider {
  return { id: "cloudflare", async generateJson(_r: GenerateRequest) { spy.n++; return { ok: true, text: JSON.stringify({ v: 1, steps: [] }) }; } };
}
const fakeShared = (verdict: SharedResult | ((name: string) => SharedResult), calls: { name: string; limit: number; windowMs: number }[] = []): SharedLimiter =>
  async (name, limit, windowMs) => { calls.push({ name, limit, windowMs }); return typeof verdict === "function" ? verdict(name) : verdict; };

test("shared limiter: not configured -> unavailable, and no network call is made", run(async () => {
  let called = 0;
  const lim = makeSharedLimiter((async () => { called++; return new Response("true"); }) as typeof fetch);
  assert.equal(await lim("x", 5, 1000), "unavailable");
  assert.equal(called, 0);
}));

test("shared limiter: true/false map to allowed/denied; request shape is exact", run(async () => {
  withDb();
  let seen: { url: string; init: RequestInit } | undefined;
  const mk = (v: unknown) => makeSharedLimiter(((url: string, init: RequestInit) => { seen = { url, init }; return reply(v)(); }) as unknown as typeof fetch, () => 5_000_000);
  assert.equal(await mk(true)("mewvi-day", 300, 86_400_000), "allowed");
  assert.equal(await mk(false)("mewvi-day", 300, 86_400_000), "denied");
  assert.equal(seen!.url, "https://example.supabase.co/rest/v1/rpc/assured_counter_hit");
  const body = JSON.parse(String(seen!.init.body));
  assert.deepEqual(Object.keys(body).sort(), ["p_exp", "p_key", "p_limit"]);
  assert.equal(body.p_key, "mewvi-day:0");
  assert.equal(body.p_limit, 300);
  assert.equal(body.p_exp, 86_400_000);
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(h.apikey, "service-key-test");
  assert.equal(h.Authorization, "Bearer service-key-test");
}));

test("shared limiter: errors, bad status, junk body and timeouts are 'unavailable', never a denial and never a throw", run(async () => {
  withDb();
  const cases: [string, typeof fetch][] = [
    ["500", (async () => new Response("no", { status: 500 })) as typeof fetch],
    ["404 (SQL not run)", (async () => new Response("{}", { status: 404 })) as typeof fetch],
    ["junk", (async () => new Response("{\"x\":1}")) as typeof fetch],
    ["not json", (async () => new Response("<html>")) as typeof fetch],
    ["network", (async () => { throw new Error("down"); }) as typeof fetch],
  ];
  for (const [name, f] of cases) assert.equal(await makeSharedLimiter(f)("k", 1, 1000), "unavailable", name);
}));

test("shared limiter: client hash is salted, stable, and absent without a real secret", run(async () => {
  assert.equal(clientHash("203.0.113.9", ""), null);
  assert.equal(clientHash("203.0.113.9", "short"), null);
  assert.equal(clientHash(undefined, SECRET), null);
  const a = clientHash("203.0.113.9", SECRET)!;
  assert.equal(a, clientHash("203.0.113.9", SECRET));
  assert.notEqual(a, clientHash("203.0.113.10", SECRET));
  assert.notEqual(a, clientHash("203.0.113.9", SECRET + "x"));
  assert.ok(!a.includes("203") && a.length === 24);
}));

test("agent: shared denial stops the model call and falls back to V1 with rate_limited", run(async () => {
  const spy = { n: 0 };
  const r = await respondWithAgent({ message: VAGUE }, "on", { router: { providers: [provider(spy)] }, shared: fakeShared("denied") });
  assert.equal(spy.n, 0, "no model call after a shared denial");
  assert.equal(r.engine, "local");
  assert.equal(r.ai, "rate_limited");
  assert.equal(snapshot().shared_limited, 1);
  assert.equal(snapshot().attempted, undefined);
}));

test("agent: 'unavailable' shared limiter does not block (in-memory limits stay the guard); 'allowed' proceeds", run(async () => {
  for (const v of ["unavailable", "allowed"] as const) {
    resetStats();
    const spy = { n: 0 };
    await respondWithAgent({ message: VAGUE }, "on", { router: { providers: [provider(spy)] }, shared: fakeShared(v) });
    assert.equal(spy.n, 1, v);
    assert.equal(snapshot()[v === "unavailable" ? "shared_unavailable" : "shared_ok"], 1);
  }
}));

test("agent: shared daily limit follows MEWVI_DAILY_BUDGET; per-client key is a hash, never the raw IP, and needs a secret", run(async () => {
  process.env.MEWVI_DAILY_BUDGET = "7";
  const calls: { name: string; limit: number; windowMs: number }[] = [];
  const spy = { n: 0 };
  await respondWithAgent({ message: VAGUE }, "on", { router: { providers: [provider(spy)] }, shared: fakeShared("allowed", calls), clientKey: "203.0.113.9" });
  assert.deepEqual(calls.map((c) => c.name), ["mewvi-day"], "no secret -> no per-client shared key");
  assert.equal(calls[0].limit, 7);
  assert.equal(calls[0].windowMs, 86_400_000);

  process.env.SHARE_TOKEN_SECRET = SECRET;
  calls.length = 0;
  await respondWithAgent({ message: VAGUE }, "on", { router: { providers: [provider(spy)] }, shared: fakeShared("allowed", calls), clientKey: "203.0.113.9" });
  assert.equal(calls.length, 2);
  assert.match(calls[1].name, /^mewvi-hr:[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify(calls).includes("203.0.113.9"));
}));

test("agent: danger and sensitive messages never reach the shared limiter or a model", run(async () => {
  const calls: { name: string; limit: number; windowMs: number }[] = [];
  const spy = { n: 0 };
  for (const m of ["I want to kill myself", "someone is following me and I am scared"]) {
    await respondWithAgent({ message: m }, "on", { router: { providers: [provider(spy)] }, shared: fakeShared("allowed", calls) });
  }
  assert.equal(spy.n, 0);
  assert.equal(calls.length, 0);
}));
