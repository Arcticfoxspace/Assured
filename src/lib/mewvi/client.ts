// src/lib/mewvi/client.ts — browser side. Asks ASSURED's server first (which may use the agent);
// if the server can't be reached or answers badly, the very same rules run here on the device,
// so Mewvi still answers offline — including the emergency flows.
import { respond } from "./respond";
import type { MewviReply, RespondInput } from "./types";

/** Anything from the network is checked before the panel renders it. */
function normalizeReply(data: unknown): MewviReply | undefined {
  const d = data as Partial<MewviReply> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.blocks) || typeof d.intent !== "string") return undefined;
  return {
    ...(d as MewviReply),
    blocks: d.blocks.filter((b) => b && typeof b === "object" && typeof (b as { type?: unknown }).type === "string"),
    confirmations: Array.isArray(d.confirmations) ? d.confirmations : [],
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.filter((s) => typeof s === "string") : [],
  };
}

export async function askMewvi(input: RespondInput): Promise<MewviReply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  // Why the server's answer was not used. A timeout or a bad reply is a server problem, not proof the device is offline.
  let fallback: NonNullable<MewviReply["fallback"]> = "network";
  try {
    const res = await fetch("/api/mewvi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      fallback = res.status === 429 ? "busy" : "server";
      throw new Error("bad_status");
    }
    const data = normalizeReply(await res.json());
    if (!data) {
      fallback = "server";
      throw new Error("bad_shape");
    }
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") fallback = "server";
    const local = await respond(input);
    return { ...local, offline: true, fallback };
  } finally {
    clearTimeout(timer);
  }
}
