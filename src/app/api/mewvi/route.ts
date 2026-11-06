import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";
import { json } from "@/lib/server/http";
import { geminiNlu } from "@/lib/server/gemini";
import { agentMode, respondWithAgent } from "@/lib/server/mewviAgent";
import { respond } from "@/lib/mewvi/respond";
import { MAX_MEWVI_BODY_CHARS as MAX_BODY_CHARS } from "@/lib/server/limits";

export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().max(2000),
  pathname: z.string().max(200).optional(),
  activeJourney: z.boolean().optional(),
});

/**
 * Mewvi's endpoint.
 *  MEWVI_AGENT unset/off : the deterministic router (+ legacy Gemini labelling if GEMINI_API_KEY is set).
 *  MEWVI_AGENT=shadow    : the agent plans and counts, but the reply is still V1's.
 *  MEWVI_AGENT=on        : the agent answers when it can; any failure returns the V1 reply.
 * Request bodies are size-limited before they are parsed, and no message content is logged.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`mewvi:${ip}`, 40, 60_000)) return json({ error: "rate_limited" }, 429);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) return json({ error: "too_large" }, 413);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) return json({ error: "too_large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const p = Body.safeParse(body);
  if (!p.success) return json({ error: "bad_request" }, 400);

  const mode = agentMode();
  if (mode === "off") return json(await respond(p.data, { nlu: geminiNlu() }));
  return json(await respondWithAgent(p.data, mode, { clientKey: ip }));
}
