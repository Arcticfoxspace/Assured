# Browser smoke checks (optional, not part of `npm test`)

Unit tests cannot see browser-only failures. In v2.14 a real Chromium run found a Mewvi panel crash
(an effect returned the Promise from `scrollIntoView`) and a tablet overflow that all 97 unit tests missed.
These scripts repeat those checks. They add **no npm dependency**; they need Python and Playwright:

    pip install playwright && python -m playwright install chromium
    npm run build && npm start            # in one terminal (port 3000, or set -p 3100)
    BASE_URL=http://localhost:3000 python scripts/browser-smoke/route_sweep.py "/,/emergency,/helplines,/women,/travel"
    BASE_URL=http://localhost:3000 python scripts/browser-smoke/mewvi_and_keyboard.py
    BASE_URL=http://localhost:3000 python scripts/browser-smoke/contrast_and_focus.py

- `route_sweep.py ROUTES` : each route at 360, 390, 768 and 1366 px. Reports console errors, failed requests, horizontal overflow, unlabeled controls, missing alt, h1 count. Expect "rows with any finding: 0".
- `mewvi_and_keyboard.py` : opens Mewvi at 360x640, sends a vague and a danger message, checks 112 is a tap-to-call link, Escape closes, focus indicators, theme toggle.
- `contrast_and_focus.py` : WCAG text contrast in light and dark, reduced motion, focus returns to the launcher, skip link, touch-target sizes.

These are Chromium only. They do not replace testing on a real Android phone, iPhone, Safari or Firefox.
