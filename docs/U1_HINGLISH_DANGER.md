# U1 — Hinglish / Devanagari danger detection (V1 classifier)

**What:** `detectDanger` in `src/lib/mewvi/intents.ts` now also recognises romanised Hindi pleas (bachao, maar raha hai, marna chahta hu, khudkushi ...) and Devanagari pleas (बचाओ, मार रहा, आत्महत्या ...).
**Why:** before this, "bachao mujhe koi maar raha hai" got `out_of_scope` from V1 (no 112 flow). The model gate only stopped the model from seeing it.
**Behaviour:** plea or threat => `emergency_danger` (112 flow); self-harm phrase => `mental_health` (support flow). Hinglish pleas ignore the "past tense" softening on purpose. Devanagari is checked on the raw text because `normalize()` erases non-Latin letters (an all-Devanagari message used to look empty and got a greeting).
**Side effects:** over-matching shows the 112 screen to a few harmless messages. Chosen deliberately: a missed plea costs more.
**NOT DONE / needs you:** the phrase list was written by me, **not reviewed by a native Hindi/Hinglish speaker**. Have one read `HINGLISH_*` and `DEVANAGARI_*` in `intents.ts` and add misspellings they know. Other languages (Rajasthani, Punjabi, Tamil...) are not covered. Non-Latin text still never reaches a model (`gate_language`).
**Tests:** `tests/hinglish.test.ts` (4 tests). Verified they fail on the old code and pass on the new.
**Rollback:** `git revert` the commit, or delete the `HINGLISH_*`/`DEVANAGARI_*` lines and the three lines in `detectDanger`/`classify` that use them.

## Session 4 update (U1b)
**Probe:** 65 realistic messages run through `classify`. Before: 14 of 34 danger and 9 of 13 self-harm messages missed (e.g. "main mar jaun", "khud ko khatam kar lunga", "koi mera peecha kar raha hai", "पति मुझे पीट रहा है"). Unmatched Devanagari got a "greeting".
**Fixed:** more Hinglish and Devanagari patterns; Devanagari now matched after NFD + nukta removal (so ज़ typed precomposed or decomposed both work); unmatched Devanagari returns `out_of_scope`, not `greeting`; "mujhe bachaya" (past, "saved me") no longer a plea. 3 new tests (92 total).
**Known misses, on purpose:** "auto wala galat raste le ja raha hai, darr lag raha" (fear in transport, Hinglish has no non-emergency flows yet); "neend ki goliyan" without "marne ke liye". Known over-matches: "bachao movie", "maar khana pasand hai", "help karo mujhe resume banana hai" show the 112 screen.
**Still needs you:** a native Hindi/Hinglish reader to go through `HINGLISH_*` and `DEVANAGARI_*` and add spellings. Regex lists are a floor, not coverage: other languages and unusual spellings still miss. Non-Latin text never reaches a model.
Rollback: `git revert` this change; tests in `tests/hinglish.test.ts` marked "U1b" go with it.

## Session 5 update (U1c)
Added patterns for clear probe misses (the review sheet and its generator are kept outside the repo, in the private handoff folder). 3 tests marked "U1c" (95 total; 2 fail on v2.7, 1 is a no-false-alarm guard). Still not native-reviewed. Rollback: `git revert` this change, or remove the lines marked `U1c (session 5)` and the added alternatives in `HINGLISH_SELF_HARM` / `DEVANAGARI_*`.

## Session 6 update (U2): line-by-line review, repair pass
**Method:** every pattern in `HINGLISH_*` and `DEVANAGARI_*` was read, then a 53-message probe (danger, self-harm, harmless; Hinglish and Devanagari) and 25 harmless sentences were run before and after. Before: 19 of 53 differed from the expected outcome. After: 1 (deliberate, below). A 76-message sheet for a native reviewer is regenerated in the private handoff folder (`U1_REVIEW_SHEET.md`, 179 patterns, 76/76 match).
**Real gaps found and fixed:** self-harm **methods** were not detected at all (phansi/fansi laga, chhat se kud, zeher kha, nas/hath kaat, train ke aage kud, pankhe se latak, and the Devanagari equivalents); female and variant verb forms were missed (`jaan de dungi`, `mar jaaunga`, `mar jana behtar hai`, `jaan dene ka mann`); violence wording was missed (`dhakka diya`, `<person> ne dhakka diya`, `haath uthata hai`, Devanagari `धक्का`, `हाथ उठा`).
**False alarms fixed:** `help karo / madad karo` + a task word (form, resume, app, number, helpline, ...) is no longer a plea; `bachao` + movie/film/song/series is no longer a plea; `tere liye jaan de dunga` (love phrase) is not self-harm. `bachao police ka number do` is still a plea (only film or task talk is excluded), by test.
**New behaviour:** Hinglish fear in a cab/auto (`auto wala galat raste le ja raha hai, darr lag raha hai`) reaches the unsafe-transport flow. Plain fear (`mujhe darr lag raha hai`, `asurakshit`, `akela hu`, `rasta bhool gaya`) reaches the calm unfamiliar-place flow, as the English equivalents already did, instead of "outside what I can help with". Unrecognised Devanagari gets links to Emergency and Helplines.
**Kept on purpose (over-matches):** `main sharm se mar jaunga` ("I will die of embarrassment") still shows the support flow: removing idiom context could also remove a real plea, and a missed plea costs more. Also `bachao movie` style text without a media word, and `maar khana pasand hai`.
**Still not covered:** burden phrases (`main sabke liye bojh hu`), indirect ideation without a method or `marna`, Devanagari fear (`मुझे डर लग रहा है` is only linked to Emergency/Helplines), other languages and heavy SMS-style misspellings.
**Sign-off status (honest):** reviewed and tested by Claude; the sheet is ready for a native reader. NOT signed off by a native speaker. Nothing in this file claims native-level accuracy.
**Tests:** `tests/hinglish.test.ts` blocks marked "U2" (103 tests total in the suite). Rollback: `git revert` the U2 commit, or delete `HINGLISH_SELF_HARM_U2`, `HINGLISH_BACHAO`, `HINGLISH_ASK_HELP`, `DEVANAGARI_SELF_HARM_U2` and the lines in `detectDanger` that use them.
