# Audit items U5 and U6 (session 3)

**U5 (`/api/status` was public with counters):** counters (including how often the danger gate fired) are now returned only when the request sends header `x-status-key` equal to env `STATUS_KEY`. Without `STATUS_KEY` set, nobody sees counters. Mode, provider ids and daily budget stay public. To watch shadow mode: `curl -H "x-status-key: YOURKEY" https://YOUR-SITE/api/status`. Rollback: revert `src/app/api/status/route.ts`.
**U6:** `flow_unfamiliar_location` removed from the agent's checklist tool list (it is a model-free intent, V1 still answers it).
**Not done:** U2 (names/addresses not redacted, needs privacy copy), U3 (per-instance limiter until Part C SQL is run live), U4 (provider pause is global; wait for live data), U7 (live provider shapes).
Tests: one new audit test; privacy test now inspects counters via the owner key. 89/89.

## Session 5 update (U2)
U2 is now partly done: best-effort masking of cue-introduced names and address cues in `redactForModel` (tests in `tests/redact.test.ts`). It is not a guarantee. Rollback: `git revert`, or delete the `NAME_CUE`/`HOUSE_CUE`/`PLACE_CUE` lines and their three `.replace` calls in `text.ts`.
