// IS THERE A STEP WHERE THE CHUNK WATER HANDS OVER TO THE PAINTED DISC?
//
// The last open item on docs/BACKLOG.md: "Fog parity: far-sea disc vs chunk water, step at the render wall." `oceanMat` gained
// uWx (14d736f) and waterMat's ring landing targets fogTo, so the two agree in a fog BANK — what has never been measured is the
// handover itself. waterMat's uMeshR is (RENDER_DIST-1)*CK, so the real water stops there and the disc carries on beyond it.
//
// AND IT MATTERS MORE NOW: the night wash was just added to both shaders (6f9afd8). The two washes measured drops of 0.711 and
// 0.743 saturation, close but not identical, so this run doubles as a check that the wash did not open a seam of its own.
//
// HOW: scan a VERTICAL column of the frame from offshore, looking level out to sea, and take the row-to-row luminance difference.
// A smooth handover means the largest single-row jump near the wall is of the same order as its neighbours' jumps. A step means one
// row difference stands well clear of the local distribution. Reported as a ratio against the median row-jump in the same band, so
// it is scale-free — the sea's own vertical gradient does not need to be modelled, only exceeded.
//
// Both hours: night (the wash is on, and the wash is the new thing) and day (where the fog and the ring were tuned).
//
// RESULT, 2026-08-05, AND THE BAND IS WRONG — fix that before trusting a number from this file. The largest row jump came back at
// row 271 of 560 in every single condition: 58.2 at night, 94.25 by day. Row 271 is 0.484 of the frame height, which is THE HORIZON
// LINE — sky meeting sea — not the render wall. The band below (0.44 to 0.70) spans it, so the sky/sea edge swamps the handover this
// file exists to find. Start the band BELOW the horizon (0.50 to 0.70 from this vantage) and re-run.
//
// WHAT IT DID ANSWER, which is why it is committed: the night wash added to both water shaders in 6f9afd8 did NOT open a seam.
// Worst jump with the wash against without, same hour, same vantage: 58.19 vs 58.87 at night and 94.25 vs 94.25 by day. Whatever
// the step at row 271 is, it is the horizon and it was already there.
//
//   node bench/tmp-sea-handover.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// per-row median across a wide horizontal strip (a median so a whitecap or a star cannot carry a row), then the row-to-row jumps
function rowProfile(file,x0f,x1f,y0f,y1f){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*x0f)|0,x1=(P.w*x1f)|0,y0=(P.h*y0f)|0,y1=(P.h*y1f)|0;
  const rows=[];
  for(let y=y0;y<y1;y++){ const v=[]; for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch)); v.sort((a,b)=>a-b); rows.push({y, med:v[v.length>>1]}); }
  const jumps=[]; for(let i=1;i<rows.length;i++) jumps.push({ y:rows[i].y, d:Math.abs(rows[i].med-rows[i-1].med) });
  const sorted=jumps.map(j=>j.d).sort((a,b)=>a-b);
  const medJump=sorted[sorted.length>>1]||0, p90=sorted[(sorted.length*0.9)|0]||0;
  let worst=jumps[0]||{y:0,d:0}; for(const j of jumps) if(j.d>worst.d) worst=j;
  return { rows:rows.length, medJump:+medJump.toFixed(3), p90Jump:+p90.toFixed(3),
           worst:+worst.d.toFixed(2), worstRow:worst.y, ratio:+(worst.d/Math.max(medJump,0.05)).toFixed(1),
           top:+rows[0].med.toFixed(1), bottom:+rows[rows.length-1].med.toFixed(1) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const isle=await page.evaluate(`__hc.isleStats()`);
    const X=Math.round(isle.x)+isle.R+150, Z=Math.round(isle.z);
    await page.evaluate(`__hc.tpAt(${X}, 48, ${Z})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:-0.06})`); await sleep(600);
    const hz=await page.evaluate(`__hc.horizonDbg()`);
    console.log(`  offshore at ${X},48,${Z}   horizon state ${JSON.stringify(hz).slice(0,150)}`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(560); await page.evaluate(`__hc.setTime(${t})`); await sleep(280); };
    for(const [tag,t] of [['night',0.94],['day',0.42]]){
      await pin(t);
      const f=path.join(OUT,`handover-${tag}.png`); await page.screenshot({path:f});
      // the band from a little above the waterline down into the near sea: the handover is somewhere in here
      const prof=rowProfile(f,0.25,0.75,0.44,0.70);
      console.log(`  ${tag.padEnd(6)} ${JSON.stringify(prof)}`);
      // and with the wash forced OFF, so any seam the wash itself opened is separable from one that was already there
      await page.evaluate(`__hc.scot({amt:0})`); await sleep(420); await pin(t);
      const f2=path.join(OUT,`handover-${tag}-nowash.png`); await page.screenshot({path:f2});
      console.log(`  ${tag.padEnd(6)} no wash ${JSON.stringify(rowProfile(f2,0.25,0.75,0.44,0.70))}`);
      await page.evaluate(`__hc.scot({amt:0.85})`); await sleep(300);
    }
    console.log(`\n  READ IT LIKE THIS: `+'`ratio`'+` is the largest single row-to-row jump over the median jump in the same band. A smooth`);
    console.log(`  handover keeps that in single figures; a hard step at the render wall stands well clear of it. Compare the wash`);
    console.log(`  and no-wash rows at the same hour to see whether the wash opened a seam or found one.`);
    console.log(`  frames: bench/results/handover-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
