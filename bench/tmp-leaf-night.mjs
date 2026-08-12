// WHY THE CANOPY IS BLACK AT NIGHT — the fog term, or the light?
//
// Ben 08-12: "leaves arent rendering at night", and then "its because of the fog". The night term on the leaf materials
// (mix toward uFolNight, weighted by three's own fogFactor) is the only fog-shaped thing that touches foliage and
// nothing else, and ?nofolnight=1 compiles it OUT. So one flag separates the two candidates: if the canopy is still
// black without the term, the fog is a pointer and the fault is in the light.
//
// Same vantage, same clock, same wind, two page loads, and the baseline is repeated at the end of each.
//   node bench/tmp-leaf-night.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null; const rows=[];
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,q] of [['folnight-on',''],['folnight-off','&nofolnight=1']]){
      const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
      await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
      await page.goto(base+'/'+PAGE+'?debug=1&rd=10'+q,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
      const IC=await page.evaluate(`__hc.isleStats()`);
      // OVER the wood, looking across the treetops. The first attempt stood on the forest floor looking up and
      // photographed the inside of a trunk cluster (bench/results/leafn-folnight-on-noon.png, first run): 97% of that
      // crop was bark, so "the leaves are black" was measured off wood. From above the canopy IS the frame.
      const fx=IC.x-Math.round(IC.R*0.35), fz=IC.z+Math.round(IC.R*0.20);
      const g=await page.evaluate(`__hc.groundY(${fx},${fz})`);
      await page.evaluate(`__hc.tpAt(${fx}+0.5, ${g}+46, ${fz}+0.5); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:-0.34})`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      for(const [when,t,fog] of [['night',0.75,0],['night-fog',0.75,0.6],['noon',0.25,0],['night-repeat',0.75,0]]){
        await page.evaluate(`__hc.fog(${fog}); __hc.freezeT(0); __hc.setTime(${t})`); await sleep(900);
        await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
        const f=path.join(OUT,`leafn-${tag}-${when}.png`); await page.screenshot({path:f});
        const buf=fs.readFileSync(f).toString('base64');
        const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
          await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
          const g2=c.getContext('2d'); g2.drawImage(im,0,0);
          const d=g2.getImageData(340,120,600,420).data; const a=[]; let dark=0;
          for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; a.push(L); if(L<3) dark++; }
          a.sort((p,q)=>p-q);
          return { med:+a[a.length>>1].toFixed(1), p90:+a[Math.floor(a.length*0.9)].toFixed(1), black:+(100*dark/a.length).toFixed(1) }; })()`);
        rows.push([`${tag} ${when}`,`med ${s.med}`,`p90 ${s.p90}`,`black% ${s.black}`]);
        console.log(`    ${tag} ${when}  med ${s.med}  p90 ${s.p90}  black% ${s.black}`);
      }
      await ctx.close();
    }
    console.log('\n  '+rows.map(r=>r.join('  |  ')).join('\n  '));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
