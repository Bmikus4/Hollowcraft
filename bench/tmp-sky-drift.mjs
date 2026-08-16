// DOES THE SKY DEGRADE OVER A SESSION, AND DOES THE PEEL GIVE IT BACK.
//
// The dial sweep (tmp-sky-hunt) ruled out weather, the fog shell, cloud, the skydark dial and the underwater restore.
// Two candidates it could not reach are TIME - Ben's report is "not immediate", and the reflection pass hides the sky
// dome every frame, which is exactly the sort of thing that decays rather than breaks - and the PEEL, the one other
// pass that saves the fog colour and the background and puts them back.
//
// So: hold the clock and the camera, sample the sky's structure every twenty seconds for four minutes with the ocean
// and its mirror pass on, then run the peel in and out and sample again. A sky that is fine at 20 s and flat at 200 s
// is a leak; a sky that is flat only after the peel is a restore that half-fires.
//
//   node bench/tmp-sky-drift.mjs [page] [minutes]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const MIN=+(process.argv[3]||4);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    await page.evaluate(`__hc.tpAt(${IC.x-IC.R-40}, ${SEA}+60, ${IC.z}); __hc.cam({yaw:${Math.atan2(1,-0)}, pitch:0.18}); __hc.dayLock(0.30); __hc.fog(0)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    const sample=async(tag)=>{
      const f=path.join(OUT,`skydrift-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const d=g.getImageData(0,0,im.width,320).data; let s1=0,s2=0,n=0,mx=0;
        for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s1+=L; s2+=L*L; n++; if(L>mx)mx=L; }
        const m=s1/n; return { mean:+m.toFixed(1), sd:+Math.sqrt(Math.max(0,s2/n-m*m)).toFixed(1), max:+mx.toFixed(0) }; })()`);
      const d2=await page.evaluate(`__hc.cmdRun("/diag")`);
      const line=(d2&&d2.out&&d2.out[0])||'';
      console.log(`    ${tag}   sky mean ${s.mean}  sd ${s.sd}  max ${s.max}   ${line.slice(0,110)}`);
      return s;
    };
    await sample('t000');
    const steps=Math.max(1, Math.round(MIN*3));
    for(let i=1;i<=steps;i++){ await sleep(20000); await sample('t'+String(i*20).padStart(3,'0')); }
    // THE PEEL, ONE WAY ONLY - AND READ THIS BEFORE BELIEVING THE ROWS BELOW. __hc.peel({begin:n}) calls beginPeel,
    // which only ever RAISES the target (PEEL.target = max(target, n)); there is no hook that calls endPeel, so
    // "peel({begin:0})" is a no-op and the rows after it are the peel still running, not a restore. The fog reach
    // falling 2215 -> 200 -> 157 -> 153 across them is the peel doing its job. endPeel itself reads correct - it puts
    // the saved colour, density and background back when VOID is off - and updateSky rewrites the density every frame
    // anyway, so the restore is belt and braces. Testing it properly needs a hook that ends the peel.
    // THE PEEL, in and out. It saves the fog colour, the density and the background and puts them back; if that restore
    // half-fires the sky is a flat wash afterwards, which is the report.
    await page.evaluate(`__hc.peel({begin:1})`); await sleep(6000);
    await sample('peel-on');
    await page.evaluate(`__hc.peel({end:1})`); await sleep(6000);
    await sample('peel-off');
    await sleep(20000); await sample('peel-off-plus20');
    await sleep(40000); await sample('peel-off-plus60');
    // THE BACKROOMS, in and out by the same functions the door uses. brApplyAtmo swaps the background, the fog and both
    // lights wholesale; brRestoreAtmo is the last atmosphere hand-back in the game that has never been measured.
    console.log('    br in  ', JSON.stringify(await page.evaluate('__hc.br(1)')));
    await sleep(4000); await sample('br-inside');
    console.log('    br out ', JSON.stringify(await page.evaluate('__hc.br(0)')));
    await sleep(4000);
    await page.evaluate(`__hc.tpAt(${IC.x-IC.R-40}, ${SEA}+60, ${IC.z}); __hc.cam({yaw:${Math.atan2(1,-0)}, pitch:0.18}); __hc.dayLock(0.30)`);
    await sleep(4000); await sample('br-after');
    await sleep(20000); await sample('br-after-plus20');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
