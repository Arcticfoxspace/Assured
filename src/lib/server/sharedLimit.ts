// src/lib/server/sharedLimit.ts — server only. A shared (cross-instance) counter for model calls.
//
// Why: the in-memory limiter in rateLimit.ts is per server instance, so on serverless hosting a
// determined person could spread requests across instances and drain the free provider quota.
// This uses the Supabase project the app already uses for journeys/reports (free tier), through
// one atomic SQL function (see supabase/schema.sql, "Part C").
//
// Rules:
//  - Never throws, never blocks longer than TIMEOUT_MS.
//  - "unavailable" (not configured, SQL not run, network error, timeout) is NOT a denial: callers
//    keep the in-memory limits, and the model call path still falls back to V1 on any failure.
//  - Only counters are stored. Client ids are salted hashes, never raw IPs, and are skipped
//    entirely when SHARE_TOKEN_SECRET is not set (an unsalted IP hash is reversible).
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

export type SharedResult = "allowed" | "denied" | "unavailable";
export type SharedLimiter = (name: string, limit: number, windowMs: number) => Promise<SharedResult>;

const TIMEOUT_MS = 1500;

export function makeSharedLimiter(fetchImpl: typeof fetch = fetch, now: () => number = Date.now): SharedLimiter {
  return async (name, limit, windowMs) => {
    const url = serverEnv.supabaseUrl();
    const key = serverEnv.supabaseKey();
    if (!url || !key || !(windowMs > 0)) return "unavailable";
    const bucket = Math.floor(now() / windowMs);
    try {
      const res = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/rpc/assured_counter_hit`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_key: `${name}:${bucket}`, p_limit: Math.max(0, Math.floor(limit)), p_exp: (bucket + 1) * windowMs }),
      });
      if (!res.ok) return "unavailable";
      const v: unknown = await res.json();
      return v === true ? "allowed" : v === false ? "denied" : "unavailable";
    } catch {
      return "unavailable";
    }
  };
}

/** A salted, truncated hash of the caller key, or null when no secret is configured. */
export function clientHash(clientKey: string | undefined, secret = process.env.SHARE_TOKEN_SECRET ?? ""): string | null {
  if (!clientKey || secret.length < 16) return null;
  return createHash("sha256").update(`${secret}:mewvi-client:${clientKey}`).digest("hex").slice(0, 24);
}
