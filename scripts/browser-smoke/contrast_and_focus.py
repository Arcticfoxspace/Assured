import json
from playwright.sync_api import sync_playwright
import os
B=os.environ.get("BASE_URL","http://localhost:3100")
routes=["/","/emergency","/helplines","/women","/cyber","/travel","/settings","/community","/report","/evidence"]
JS="""() => {
 const parse=c=>{const m=c.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
 const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
 const bgOf=e=>{let layers=[];while(e){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1)break}e=e.parentElement}
   let base={r:255,g:255,b:255};if(!layers.length||layers[layers.length-1].a<1){const root=parse(getComputedStyle(document.body).backgroundColor);if(root&&root.a>0)base=root}
   for(let i=layers.length-1;i>=0;i--){const l=layers[i];base={r:l.r*l.a+base.r*(1-l.a),g:l.g*l.a+base.g*(1-l.a),b:l.b*l.a+base.b*(1-l.a)}}return base};
 const out=[];const seen=new Set();
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(w.nextNode()){const t=w.currentNode;if(!t.textContent.trim())continue;const e=t.parentElement;if(!e||seen.has(e))continue;seen.add(e);
  const s=getComputedStyle(e);const r=e.getBoundingClientRect();if(r.width<1||r.height<1||s.visibility==='hidden'||s.display==='none'||parseFloat(s.opacity)<0.5||e.closest('.sr-only,[aria-hidden=true]'))continue;
  const fg=parse(s.color);if(!fg)continue;const bg=bgOf(e);const a=fg.a;const f={r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a)};
  const L1=lum(f),L2=lum(bg);const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  const size=parseFloat(s.fontSize),bold=parseInt(s.fontWeight)>=700;const large=size>=24||(size>=18.66&&bold);
  if(ratio<(large?3:4.5)) out.push({txt:t.textContent.trim().slice(0,28),ratio:+ratio.toFixed(2),size,tag:e.tagName});}
 return out;}"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for scheme in ("light","dark"):
        ctx=br.new_context(viewport={"width":390,"height":844},color_scheme=scheme); pg=ctx.new_page()
        pg.goto(B+"/",wait_until="networkidle")
        pg.evaluate(f"localStorage.setItem('assured-theme','{scheme}')")
        tot=0
        for r in routes:
            pg.goto(B+r,wait_until="networkidle")
            pg.wait_for_timeout(250); bad=pg.evaluate(JS); tot+=len(bad)
            if bad: print(scheme,r,len(bad),bad[:4])
        print(scheme,"total low-contrast text nodes:",tot)
        ctx.close()
    # reduced motion + skip link + focus return
    ctx=br.new_context(viewport={"width":390,"height":844},reduced_motion="reduce"); pg=ctx.new_page(); pg.goto(B+"/emergency",wait_until="networkidle")
    pg.click('button[aria-label="Open Mewvi assistant"]'); pg.wait_for_timeout(100)
    an=pg.evaluate("()=>{const d=document.querySelector('[role=dialog][aria-label=\"Mewvi assistant\"]');const s=getComputedStyle(d);return [s.animationDuration,s.animationName]}")
    print("reduced-motion: panel animation",an)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    print("focus returns to launcher after close:",pg.evaluate("document.activeElement.getAttribute('aria-label')"))
    ctx.close()
    ctx=br.new_context(viewport={"width":1366,"height":768}); pg=ctx.new_page(); pg.goto(B+"/",wait_until="networkidle"); pg.keyboard.press("Tab")
    print("first tab stop:",pg.evaluate("document.activeElement.innerText||document.activeElement.getAttribute('aria-label')"), "| main landmark:",pg.locator("main").count())
    br.close()
# --- skip link + touch targets
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={"width":1366,"height":768}); pg=ctx.new_page(); pg.goto(B+"/",wait_until="networkidle"); pg.keyboard.press("Tab")
    print("skip link first tab stop:",pg.evaluate("document.activeElement.innerText"), "visible:",pg.locator("a[href='#main-content']").is_visible())
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200); print("after Enter focus on main:",pg.evaluate("document.activeElement.id"))
    ctx.close()
    ctx=br.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True); pg=ctx.new_page()
    for r in ["/","/emergency","/helplines","/settings","/travel/check-in","/community"]:
        pg.goto(B+r,wait_until="networkidle")
        small=pg.evaluate("""()=>[...document.querySelectorAll('a,button,input,select,textarea,[role=radio],summary')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&Math.min(r.width,r.height)<40}).map(e=>(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,22)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))""")
        print(r.ljust(18),len(small),"targets under 40px:",small[:6])
    br.close()
