import json, sys
from playwright.sync_api import sync_playwright
import os
B=os.environ.get("BASE_URL","http://localhost:3100")
routes=sys.argv[1].split(",")
VIEWS={"android-360x740":(360,740,True),"iphone-390x844":(390,844,True),"tablet-768x1024":(768,1024,False),"desktop-1366x768":(1366,768,False)}
JS="""() => {
  const vw=document.documentElement.clientWidth;
  const out={scrollW:document.documentElement.scrollWidth, vw, overflowEls:[], noName:[], noAlt:0, small:0, smallList:[], noLabel:[]};
  const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  document.querySelectorAll('body *').forEach(e=>{ if(!vis(e)) return; const r=e.getBoundingClientRect(); if(r.right>vw+1 && !e.closest('[class*="overflow-x"],[class*="overflow-auto"],[class*="overflow-hidden"],svg')) { if(out.overflowEls.length<4) out.overflowEls.push(e.tagName+'.'+(e.className&&e.className.toString().slice(0,60))+' r='+Math.round(r.right)); }});
  document.querySelectorAll('a,button,[role=button],input,select,textarea,summary').forEach(e=>{ if(!vis(e)) return; const r=e.getBoundingClientRect();
    const name=(e.getAttribute('aria-label')||e.innerText||e.value||e.getAttribute('title')||e.getAttribute('placeholder')||'').trim();
    const lbl=e.id&&document.querySelector('label[for="'+e.id+'"]');
    const labelled=name||e.getAttribute('aria-labelledby')||lbl||e.closest('label');
    if(!labelled) { if(out.noName.length<4) out.noName.push(e.tagName+'.'+(e.className&&e.className.toString().slice(0,40))); }
    if((e.tagName==='INPUT'||e.tagName==='SELECT'||e.tagName==='TEXTAREA') && e.type!=='hidden' && !(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||lbl||e.closest('label')) ) out.noLabel.push(e.tagName+'#'+e.id+'['+(e.getAttribute('placeholder')||'')+']');
    if(Math.min(r.width,r.height)<24){ out.small++; if(out.smallList.length<3) out.smallList.push(e.tagName+':'+name.slice(0,20)+' '+Math.round(r.width)+'x'+Math.round(r.height)); }
  });
  document.querySelectorAll('img').forEach(i=>{ if(!i.hasAttribute('alt')) out.noAlt++; });
  out.h1=document.querySelectorAll('h1').length; out.lang=document.documentElement.lang; out.title=document.title;
  return out; }"""
res=[]
with sync_playwright() as p:
    br=p.chromium.launch()
    for vname,(w,h,mobile) in VIEWS.items():
        ctx=br.new_context(viewport={"width":w,"height":h},is_mobile=mobile,has_touch=mobile,device_scale_factor=2 if mobile else 1)
        for r in routes:
            pg=ctx.new_page(); errs=[]; fails=[]
            pg.on("console",lambda m,errs=errs: errs.append(m.text[:140]) if m.type=="error" else None)
            pg.on("pageerror",lambda e,errs=errs: errs.append("PAGEERROR "+str(e)[:140]))
            pg.on("requestfailed",lambda q,fails=fails: fails.append(q.url[:90]+" "+str(q.failure)[:40]))
            pg.on("response",lambda rs,fails=fails: fails.append(str(rs.status)+" "+rs.url[:90]) if rs.status>=400 else None)
            try:
                resp=pg.goto(B+r,wait_until="networkidle",timeout=20000)
                pg.wait_for_timeout(300)
                m=pg.evaluate(JS)
                res.append(dict(view=vname,route=r,status=resp.status,errs=errs,fails=fails,**m))
            except Exception as e:
                res.append(dict(view=vname,route=r,status="EXC",errs=[str(e)[:120]],fails=fails))
            pg.close()
        ctx.close()
    br.close()
json.dump(res,open("/tmp/sweep.json","w"))
print("routes x views:",len(res))
bad=[x for x in res if x["status"]!=200 or x["errs"] or x["fails"] or x.get("scrollW",0)>x.get("vw",0)+1 or x.get("overflowEls") or x.get("noName") or x.get("noLabel") or x.get("noAlt") or x.get("h1",1)!=1]
print("rows with any finding:",len(bad))
for x in bad[:50]:
    print(x["view"],x["route"],"st",x["status"],"sw/vw",x.get("scrollW"),x.get("vw"),"h1",x.get("h1"),"| errs",x["errs"][:2],"| fails",x["fails"][:2],"| ovf",x.get("overflowEls"),"| noName",x.get("noName"),"| noLabel",x.get("noLabel"),"| noAlt",x.get("noAlt"))
