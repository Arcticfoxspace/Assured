# v2.14 repair release (base: v2.12, `9883743`)

No secrets in this file. Everything below was run unless marked NOT VERIFIED.

## Changes
| Area | Change | Evidence |
|---|---|---|
| Gemini | Removed `src/lib/server/gemini.ts`, the key/model env reads, the `gemini` field in `/api/status`, the optional-classifier hook in `respond()`, the `"gemini"` engine value, docs and tests. No npm package existed (plain `fetch`). Zero Gemini references remain in source, `package.json`, lockfile or the built bundle, except 5 deliberate guard-test lines in `tests/agent.test.ts` | build with no Gemini variable; fetch-trap tests; leftover `GEMINI_API_KEY` is ignored |
| Mewvi crash | Panel crashed on every send in current Chromium: `useEffect` returned the result of `scrollIntoView` (a Promise in newer browsers). Fixed with a braced body | reproduced in dev (unminified stack) and prod, fixed, re-run |
| Tablet layout | Header needed ~1013px but switched at 768px, so every page scrolled sideways. Header, footer, mobile nav, launcher offsets and page padding now switch at `lg` | 28 routes x 360/390/768/1366 px: 112/112 clean |
| Fallback honesty | 429 / 5xx / timeout were shown as "offline". New `fallback` field (`network | busy | server`) and matching panel text; provider-failure text says the answer is built-in guidance. When the agent answers, the panel says an AI helper was used and that masking is not guaranteed | unit test; the agent-answer line is NOT VERIFIED visually (needs a live provider) |
| Danger rules | "help me plan / prepare / draft / get ready / make a plan" no longer shows 112; real pleas stay urgent (tested both ways) | tests |
| Hindi / Hinglish | Line-by-line review, see `docs/U1_HINGLISH_DANGER.md` (Session 6). Probe: 19/53 differed before, 1/53 after (deliberate). 25 harmless sentences: 0 false alarms | tests "U2", probes |
| Accessibility | Light and dark `muted` text tokens darkened/lightened to pass AA (391 low-contrast text nodes -> 0); amber badge, active filter chips and dark emergency red fixed; skip-to-content link; focus returns to the Mewvi launcher on close; `aria-pressed` and a labelled group on helpline filters; breadcrumb and search hit areas enlarged; overlay sheets use `dvh` | `scripts/browser-smoke/contrast_and_focus.py` |
| Tooling | `scripts/browser-smoke/` (Python + Playwright, optional, no npm dependency) | README inside |

## Test status
PASS: `npm ci`; 103/103 unit tests; `tsc`; lint; production build; 28 routes return 200; Chromium route sweep (console errors, failed requests, overflow, labels, alt, h1); Mewvi panel flow at 360x640 (fits from 320x568 to 390x844); keyboard focus indicators; skip link; focus return; reduced-motion CSS; text contrast light and dark; theme toggle; empty-submit messages on check-in and community; live API probes.
NOT VERIFIED: real Android, iPhone, Safari, Firefox, Windows browsers (Chromium emulation only); on-screen keyboard overlap; screen readers; filled-in submissions of report, evidence and guardian flows; Supabase; Cloudflare Workers AI and Ollama Cloud live; agent `shadow` / `on`; deployment.
Known and accepted: some controls are 30-36px tall (above the WCAG 2.2 AA minimum of 24px, below the 44px guideline).

## Deployment
1. Vercel > Settings > Environment Variables: delete `GEMINI_API_KEY` and `GEMINI_MODEL` in every environment (harmless if left).
2. Push this repo to GitHub; Vercel redeploys. Check `/api/status`: `assistant.agent.mode` is `off`.
3. Optional agent: `MEWVI_AGENT=shadow`, `CF_ACCOUNT_ID`, `CF_AI_TOKEN` (Workers AI only), then follow the private `PART_A_LIVE_TEST.md`. Never use `on` before shadow results look right. Enter values only in Vercel.
4. After deploy, run the browser checks against the live URL: `BASE_URL=https://... python scripts/browser-smoke/route_sweep.py "/,/emergency"`.

## Rollback
`git revert` the v2.14 commits. Nothing in the database or environment changed, so no migration is needed.
