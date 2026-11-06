# D1 — Additional verified official resources (Prompt 6, capability 1)

Pre-checks: (1) V1 had no human-rights or narcotics helpline. (2) Data only: two JSON entries plus two source records, no new code path. (3) Free, no provider needed, works offline. (4) No permissions or personal data. Failure state: none, static data. (5) `tests/helplines-data.test.ts`: unique ids, every entry has a source, `.gov.in`/`.nic.in` source URL, ISO dates. (6) Provider-independent by construction.

| Entry | Number | Official source checked 2026-11-03 | Not confirmed |
|---|---|---|---|
| NHRC Helpline `nhrc-14433` | 14433 | nhrc.nic.in FAQ and contact page list "Toll Free 14433" (page footer "Last Updated 13-Aug-2026"); DoT short-code allocation to NHRC | Operating hours not stated on the pages I saw, so the entry says "check nhrc.nic.in". A secondary site calls it a women's helpline: ignored, official pages say human-rights helpline |
| MANAS `manas-1933` | 1933 (counselling linked to MoSJE 14446) | PIB factsheet (pib.gov.in Id=150669), DIC page (dic.gov.in/dic_journey/manas/), Lok Sabha reply (24x7 toll-free 1933) | No `website` field: the portal domain appeared only in a news article, not an official page. Add it after you open the official portal |

Side effect: both numbers are dialable, so they appear in the `propose_call` id list given to the planner and in the Helplines page/categories (`human-rights`, `drugs`, `addiction`). Calls still need a Yes tap.
Please re-open both source pages yourself before launch. Numbers and hours change.
Rollback: delete the two entries and two sources from `src/data/helplines/*.json`.
