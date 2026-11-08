# ASSURED — AI safety notes (Part 4: Mewvi)

Mewvi is ASSURED's navigation-first assistant. This document says what it may and may not do, and where each rule is enforced in code.

## What Mewvi is for
Helping a person **find and operate ASSURED**: the right helpline, report page, travel tool or guide, plus short guidance for common situations. It is **not** police, medical care, legal representation or emergency response, and it says so in the panel and in urgent replies.

It is **not** a general assistant. Unrelated requests ("write a poem", "who won the IPL") and attempts to change its rules get a polite "I only help with ASSURED".

## Architecture

```
message → sanitise → local classifier (danger decided HERE, always)
        → tools + flows (verified data only) → guard → reply
        (no model is involved on this path; the optional agent is described below)
```

| Piece | File |
|---|---|
| Local intent + danger rules | `src/lib/mewvi/intents.ts` |
| Page awareness | `src/lib/mewvi/context.ts` |
| Safety flows (≤ 4 steps each) | `src/lib/mewvi/flows.ts` |
| Tools | `src/lib/mewvi/tools.ts` |
| Verified data + allow-lists | `src/lib/mewvi/catalog.ts` |
| Hallucination guard | `src/lib/mewvi/guard.ts` |
| Orchestrator | `src/lib/mewvi/respond.ts` |
| API | `src/app/api/mewvi/route.ts` |
| Browser client with offline fallback | `src/lib/mewvi/client.ts` |

The same `respond()` runs on the server and in the browser, so Mewvi still answers (including emergency guidance) with no network.

## Tools
`searchHelplines`, `findNearbyHelp`, `navigateTo`, `searchCyberResources`, `searchWomenResources`, `searchTravelTools`, `startCheckIn`, `prepareReport`, `shareLocation` (all in `tools.ts`).

## Rules and how they are enforced

1. **Never invent phone numbers, emails or government URLs.**
   - Reply text is written from templates and the verified dataset (`src/data/helplines`, `src/data/resources`). A model never writes reply text.
   - Every reply passes `guard.ts`: numbers, emails and hostnames in text must match the verified allow-lists or are replaced with `[unverified detail removed]`; links must be a known ASSURED route or a verified official host over https; helpline cards are re-hydrated from the dataset; `tel:` buttons must be a verified number.
   - If something isn't in the dataset (a specific police station, a state office, an email), Mewvi says so and points to the directory instead of guessing.

2. **Sensitive actions need explicit confirmation.** Calling, sharing location and starting a check-in are only ever *proposed* as a confirmation card ("Would you like to open the call option for 112?"). Reply blocks never contain a `tel:` link. The "Call…" button on a helpline card opens the same confirmation. Mewvi never reads or sends a location itself; "Yes" only opens the page, where the person still taps each button.

3. **No model is used on the built-in path, and danger is never sent to one.**
   - With `MEWVI_AGENT` unset or `off`, Mewvi answers from local rules only (`ai: "off"`, `engine: "local"`). It makes no external request and needs no key.
   - Danger and self-harm detection run locally first, always. The optional agent (below) never sees danger or sensitive messages, and cannot downgrade a local danger decision.
   - Before anything leaves the server in agent mode, emails, links and phone-like digit runs are masked, and (best effort) names given after "my name is / call me / mera naam" and house-number or "near <place> colony/road" cues.
   - If a provider fails (bad key, rate limit, timeout, malformed output), the built-in rules answer and the reply says `ai: "invalid_key" | "rate_limited" | "unavailable"`. The panel tells the person that this answer came from built-in guidance.
   - Provider keys are read only on the server (`src/lib/env.ts`), never prefixed `NEXT_PUBLIC_`.

4. **Immediate danger** (`emergency_danger`, `flow_followed`, `flow_unsafe_transport`, self-harm): lead with 112, then a trusted contact and location sharing, then heading toward a safe public place. Short, never a wall of text. Past-tense mentions ("I was attacked last year") and pure information requests ("what is the emergency number?") are treated as reporting/helpline questions, not emergencies.

5. **No silent action.** Nothing calls, messages, alerts or reports on the person's behalf. This includes the distress demo.

## Privacy
- Messages are processed to produce a reply and are not stored by Mewvi. The conversation lives in the browser tab's memory only.
- The only device state Mewvi is told is whether a journey is active (a yes/no). It never receives a location.
- Evidence Organizer data (notes, files) stays in the browser (localStorage / IndexedDB) and is never uploaded. The scam-call helper analyses text on the device.
- Rate limit: 40 Mewvi requests per minute per IP (best effort; see `rateLimit.ts`). Request bodies over 4096 characters are refused.
- If the agent's free providers are used, the provider receives the masked message described above (names and addresses are masked only by the cues listed there; a name or address written any other way is NOT removed) and applies its own terms. When the agent produced an answer, the panel says so on screen: "This answer used an AI helper. Names and addresses are masked only in some cases and are not guaranteed to be removed."

## Agent mode (optional, OFF by default)
Set `MEWVI_AGENT=on` (or `shadow`) to let a free hosted model *plan* which approved tools to run for vague, non-sensitive messages. With the variable unset, Mewvi behaves exactly as described above.

```
message → V1 answer (always computed first = the fallback)
        → gate: danger / sensitive / confident messages NEVER reach a model
        → limits (per client, daily budget, in-flight cap) → free provider(s)
        → strict JSON plan (≤3 steps, approved tools only; rejected, never repaired)
        → executor (re-validates args, time limits, no repeats, verifies results)
        → composer (fixed wording + verified data) → guard → reply
```
Any failure at any step returns the V1 reply. The model never writes text, numbers or links; it only picks tool names and enum values.

| Tool | Risk | What it does |
|---|---|---|
| `search_resources` | read | ASSURED guides/tools for cyber, women or travel |
| `get_helplines` | read | Verified national helplines for a topic |
| `navigate` | read | Link to an existing ASSURED page |
| `get_checklist` | read | "What to keep" evidence checklist, or a situation's steps (sensitive situations excluded) |
| `prepare_draft` | read | Fill-in-the-blanks message/report for the person to review and copy. Mewvi never sends it |
| `propose_call`, `propose_share_location`, `propose_check_in` | propose | Offer a confirmation card only. Nothing runs until the person taps Yes |

**What a model is sent:** one message with emails, links, decimal coordinates and phone-like numbers masked, plus best-effort masking of self-introduced names and address cues (not a guarantee; other names and addresses, e.g. "my husband Rakesh" or "Sunrise Apartments", pass through), plus the page path. Never danger or sensitive messages, locations, journey state, history, contacts or evidence.

**Providers (free only):** Cloudflare Workers AI (primary) and Ollama Cloud (optional secondary). Unknown or paid provider names in `MEWVI_PROVIDERS` are ignored. A "needs a paid plan" answer just pauses that provider. Per their own docs as of 2026-11: Cloudflare keeps no prompt/response content for standard requests and does not train on it; Ollama says it does not train on prompts or responses. Re-check both before launch.

| Variable (server-only) | Purpose |
|---|---|
| `MEWVI_AGENT` | `off` (default), `shadow` (plan and count, answer with V1), `on` |
| `MEWVI_PROVIDERS` | Order, default `cloudflare,ollama` |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN`, `CF_AI_MODEL` | Cloudflare. Use a token limited to Workers AI. Model optional |
| `OLLAMA_API_KEY`, `OLLAMA_MODEL` | Ollama Cloud. The model must be set explicitly |
| `MEWVI_DAILY_BUDGET` | Max model calls per day (default 300). Per server instance, or for the whole deployment once the shared counter is set up (below) |

**Shared counter (optional, Part C):** if Supabase is configured **and** the "Part C" block in `supabase/schema.sql` has been run, model calls are also counted across all server instances: one deployment-wide daily budget, plus a per-client hourly cap when `SHARE_TOKEN_SECRET` is set (clients are stored only as salted hashes, never raw IPs). Only counters are stored. If the counter is unreachable the agent keeps the in-memory limits and the V1 fallback; it never blocks V1. Not yet tested against a live Supabase.

**Limits that are still per instance:** the per-minute client limiter and the in-flight cap are in memory, so on serverless hosting they are best effort. Without the shared counter the daily budget is also per instance. The provider's own free quota is the hard stop. `/api/status` shows mode, configured provider ids and counters (never keys or message text).

**Roll back:** unset `MEWVI_AGENT` (or set it to `off`). No redeploy of code is needed beyond Vercel's normal env-var redeploy.

## Other Part 4 features and their honest limits
- **Evidence Organizer** (`/evidence`): notes, images, documents, dates → summary, timeline, checklist; export as text, copy, print. The checklist is taken from ASSURED's verified report guides. It does **not** claim legal admissibility.
- **Suspicious call helper** (`/cyber/scam-call`): a browser cannot see or block ordinary phone calls. It checks text the person types for common red-flag patterns, never gives a "safe"/"scam" verdict, and links to official reporting.
- **Distress demo** (`/safety/distress-demo`): labelled *Prototype*, *Experimental*, *Requires microphone permission*. It measures loudness against a room baseline. It cannot recognise screams or assault. Audio is processed in memory only. On trigger it only asks "Are you okay?"; "I Need Help" shows a Call 112 button the person must tap. It never contacts anyone.

## Test matrix (`tests/mewvi.test.ts`, built-in rules; `tests/agent.test.ts`, agent)
`tests/agent.test.ts` covers: plan validation (unknown tools/args/extra fields rejected), the tool registry and confirmation-only actions, executor limits/timeouts/malformed results, the model gate (danger/sensitive never reach a model), provider outage/timeout/quota/auth/invalid output, privacy masking, secrets staying out of replies, prompt-injection attempts, budget/limit enforcement, free-only provider handling, the Cloudflare and Ollama adapters (with fake network), the route's size and rate limits, and the browser client's handling of bad server replies.

### V1 matrix
| Requirement | Test |
|---|---|
| No key, no network | "no key needed: the built-in path makes no network request…" |
| Navigation | "navigation: …", "report assistant: …" |
| Tool execution | "tools: …" |
| Confirmation flows | "sensitive actions are only proposed…" |
| Hallucination prevention | "guard: forged…", "every number Mewvi shows…", "unknown station or email…", "stays inside ASSURED…" |
| Emergency guidance | "emergency: …", "self-harm: …", "guidance flows…", "scenario messages…" |
| Mewvi across routes | "Mewvi answers … on every ASSURED page", "context: …" |
| Hindi / Hinglish / Devanagari danger and self-harm (`tests/hinglish.test.ts`) | "U1 …", "U1b …", "U1c …", "U2 …": pleas, methods, variant verb forms, harmless look-alikes, film/task talk, "bachao + number" stays a plea, Hinglish fear in a cab |
| Honest fallback reason | "client: the reason for a fallback is reported honestly…" |

**Status:** run `npm test`; CI (`.github/workflows/ci.yml`) does so too. Browser behaviour is **not** covered by these unit tests. `scripts/browser-smoke/` (Python + Playwright, Chromium, optional) repeats the route sweep at four widths, the Mewvi panel flow, keyboard focus and text contrast; see its README. Real Android, iPhone, Safari, Firefox and Windows devices still need manual checking.

## Known limits
- Local matching is keyword/pattern based. Hindi, Hinglish and Devanagari danger and self-harm phrases are matched too. The lists were reviewed line by line and probe-tested (76 messages) in session 6, but a native Hindi/Hinglish speaker has not signed them off (see `docs/U1_HINGLISH_DANGER.md`). Other languages (Punjabi, Tamil, Rajasthani, ...) are not covered. Unusual spellings or phrasing may fall through to "outside what I can help with", and a Devanagari message that matches nothing gets links to the Emergency and Helplines pages.
- Guidance is general safety information, not a substitute for professional or official help.
- Re-verify the helpline data (`sources.json`) before a public launch, as numbers change.

## Turning things off
Unset `MEWVI_AGENT` (or set it to `off`) to disable the agent. Mewvi keeps working on its built-in rules.
