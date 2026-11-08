from playwright.sync_api import sync_playwright
import os
B=os.environ.get("BASE_URL","http://localhost:3100")
def log(k,v): print(k.ljust(52),v)
with sync_playwright() as p:
    br=p.chromium.launch()
    # 1. Mewvi on small Android
    ctx=br.new_context(viewport={"width":360,"height":640},is_mobile=True,has_touch=True)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)[:100])); pg.on("console",lambda m:errs.append(m.text[:100]) if m.type=="error" else None)
    pg.goto(B+"/emergency",wait_until="networkidle")
    pg.click('button[aria-label="Open Mewvi assistant"]')
    dlg=pg.locator('[role=dialog][aria-label="Mewvi assistant"]'); dlg.wait_for(); pg.wait_for_timeout(700)
    bb=dlg.bounding_box(); log("dialog fits 360x640",bb and bb["x"]>=0 and bb["y"]>=0 and bb["x"]+bb["width"]<=360 and bb["y"]+bb["height"]<=640)
    inp=pg.locator('input[aria-label="Message Mewvi"]'); inp.fill("xyz qwerty"); pg.keyboard.press("Enter")
    pg.wait_for_selector("text=outside what I can help with",timeout=8000); log("vague message gets built-in reply","ok")
    inp.fill("Someone is attacking me"); pg.keyboard.press("Enter")
    pg.wait_for_selector("text=112",timeout=8000); log("danger reply shows 112","ok")
    log("112 shown as tap-to-call link (never auto-dial)", pg.locator('[role=dialog] a[href^="tel:"]').count()>0)
    send=pg.locator('button[aria-label="Send"]').bounding_box(); log("send button >=44px", send and min(send["width"],send["height"])>=44)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); log("Escape closes dialog", dlg.count()==0)
    log("console/page errors", errs or "none")
    ctx.close()
    # 2. Tablet nav
    ctx=br.new_context(viewport={"width":768,"height":1024},is_mobile=True,has_touch=True); pg=ctx.new_page(); pg.goto(B+"/",wait_until="networkidle")
    log("768: header hidden, bottom nav visible", (not pg.locator("header").first.is_visible()) and pg.locator("nav").last.is_visible())
    ctx.close()
    # 3. Desktop keyboard focus + theme
    ctx=br.new_context(viewport={"width":1366,"height":768}); pg=ctx.new_page(); pg.goto(B+"/",wait_until="networkidle")
    bad=[]
    for i in range(14):
        pg.keyboard.press("Tab")
        r=pg.evaluate("()=>{const e=document.activeElement;if(!e||e===document.body)return null;const s=getComputedStyle(e);return {t:e.tagName+':'+(e.getAttribute('aria-label')||e.innerText||'').slice(0,18),o:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0,sh:s.boxShadow!=='none'}}")
        if r and not (r["o"] or r["sh"]): bad.append(r["t"])
    log("first 14 tab stops show a focus indicator", bad or "all")
    before=pg.evaluate("document.documentElement.style.colorScheme")
    pg.get_by_role("radio",name="Dark theme").first.click(); pg.wait_for_timeout(300)
    after=pg.evaluate("document.documentElement.style.colorScheme")
    log("theme toggle changes theme", f"{before} -> {after}")
    ctx.close(); br.close()
