// WHAT CAN FLATTEN THE SKY TO A WHITE WASH. Ben: "I cannot see the sky ... if the sky has no clouds, or visible sun and
// is instead some white washed, it was not fixed."
//
// Chased the same way the canopy was: hold the clock (__hc.dayLock, since freezeT only pins the shader time), hold the
// camera, and move ONE term at a time. The metric is structure, not brightness - a sky with cloud and a sun disc in it
// has a spread of values, and a wash is flat however bright it is. sd is the number to read; mean and max come with it
// because a wash can be either bright or grey, and the sun disc pins the max.
//
// The candidates, in the order they can each erase a sky: the weather fog SHELL (a fog-coloured sphere whose opacity
// tracks weather.fog, drawn where sky shows - it exists to hide the skybox in a bank), the sky's own darkening dial
// (skydark), the cloud amount, and the fog colour the horizon eases into.
//
//   node bench/tmp-sky-hunt.mjs [page]
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
    // High over the shore looking out and slightly up: sky fills the upper two thirds, the sun is off to one side, and
    // there is a horizon in frame so a wash that eats the horizon is visible as well as measurable.
    const x=IC.x-IC.R-40, z=IC.z;
    await page.evaluate(`__hc.tpAt(${x}, ${SEA}+60, ${z}); __hc.cam({yaw:${Math.atan2(1,-0)}, pitch:0.18}); __hc.dayLock(0.30)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    const shoot=async(tag,setup)=>{
      await page.evaluate(setup); await sleep(4500);          // the shell's opacity RAMPS toward the weather target
      const f=path.join(OUT,`skyhunt-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const d=g.getImageData(0,0,im.width,320).data; let s1=0,s2=0,n=0,mx=0;
        for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s1+=L; s2+=L*L; n++; if(L>mx)mx=L; }
        const m=s1/n; return { mean:+m.toFixed(1), sd:+Math.sqrt(Math.max(0,s2/n-m*m)).toFixed(1), max:+mx.toFixed(0) }; })()`);
      const fi=await page.evaluate(`__hc.fogInfo()`);
      console.log(`    ${tag}   sky mean ${s.mean}  sd ${s.sd}  max ${s.max}   wx ${fi.wx} fogLum ${fi.colorLum.toFixed(3)}`);
      return s;
    };
    await shoot('base',        `__hc.fog(0); __hc.vis({skydark:0.62, cloud:1, fogmul:1})`);
    await shoot('wx02',        `__hc.fog(0.2)`);
    await shoot('wx05',        `__hc.fog(0.5)`);
    await shoot('wx09',        `__hc.fog(0.9)`);
    await shoot('cloud0',      `__hc.fog(0); __hc.vis({cloud:0})`);
    await shoot('skydark10',   `__hc.vis({cloud:1, skydark:1.0})`);
    await shoot('skydark03',   `__hc.vis({skydark:0.3})`);
    await shoot('base-repeat', `__hc.vis({skydark:0.62}); __hc.fog(0)`);
    // ---- AND THE STATE-LEAK CANDIDATES ----
    // Nothing above can flatten the sky, so the next suspects are the passes that SAVE AND RESTORE the atmosphere:
    // going under water swaps the fog colour, the density and the background wholesale, and the restore is the kind of
    // thing that leaves a flat wash behind if it half-fires. Ben's report is random and not immediate, which is what a
    // state leak after an event looks like.
    { const IC2=IC, SEA2=SEA;
      await page.evaluate(`__hc.tpAt(${IC2.x-IC2.R-40}, ${SEA2}-6, ${IC2.z})`); await sleep(2500);
      await page.evaluate(`__hc.tpAt(${IC2.x-IC2.R-40}, ${SEA2}+60, ${IC2.z}); __hc.cam({yaw:${Math.atan2(1,-0)}, pitch:0.18})`); await sleep(2500); }
    await shoot('after-swim', `__hc.fog(0)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
