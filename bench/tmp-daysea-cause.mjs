// WHAT MAKES HALF THE DAYLIGHT SEA PURE BLACK? — the A/B before any fix.
//
// 2f05d7f measured it: at the offshore vantage, luminance<3 covers 17.5% of the sea band at rd 4 rising to 49.28% at rd 8, in
// daylight, and 0.00% at night at every rd. The proposed mechanism was written down UNPROVEN, and this file is the proof or the
// refutation. Every condition below is an existing dial, so nothing has to be changed to run it.
//
//   base        the shipped build, for the number everything else is read against
//   fresCap 1   lets the sky reflection fully replace the depth colour at a grazing angle. If the black is "min(F,uFresCap) caps the
//               sky at 0.42 and the rest is the near-black body", this kills it.
//   body up     raises uBody, the colour the Beer term sinks the surface toward. If the black is that sink, this kills it.
//   foam 0      the shore foam off. It is white, so it should do nothing — it is here as the control that proves a dial CAN read as
//               no change, which is what makes the ones that do change mean something.
//   glade 0     the sun/moon track off. Also should do nothing to the dark pixels.
//   seaNight 8  the NIGHT in-scatter floor at eight times shipped. It is multiplied by (1-uDay), so in daylight it must do NOTHING —
//               and if it does nothing while `body up` fixes it, that is the whole argument for a day-side floor in one pair.
//
// AND ONE NON-WATER SUSPECT, because the streaks are organic-looking and the sea is full of kelp: if none of the water dials move it,
// the black is not the water shader at all and the next place to look is what is drawn ON the water.
//
// RESULT, 2026-08-05. ONE DIAL KILLS IT AND THE OTHERS DO NOTHING, AND THE WAY IT DIES IS THE FINDING:
//   base            black 49.71%   med 36.2      the artefact, reproduced
//   fresCap 1       black 49.11%   med 37.3      NO effect — the Fresnel cap is NOT the cause, so the mechanism guessed in 2f05d7f
//                                                (min(F,uFresCap) capping the sky reflection) is REFUTED
//   body up         black  0.00%   med 86.8      seaLook({body:[0.05,0.10,0.12]}) — gone
//   body "back"     black  0.00%   med 22.8      and it DOES NOT COME BACK
//   foam 0 / glade 0 / seaNight x8 and every restore after that: black 0.00%, med 22.8, unchanged
// THE CONTROL FAILED — after `body up` NOTHING comes back, including a restore to a value darker than the shipped one. So every row
// below `body up` is downstream of that and CANNOT BE READ. Only the rows above it are evidence.
// A THEORY RAISED AND KILLED IN ONE RUN, recorded so it is not raised again: the failed control looked like the ACT OF WRITING the
// uniform mattering rather than its value — a stale or unbound uBody, in the family of the UniformsUtils.clone trap this bench
// already records. It is not. `body NO-OP` writes uBody its OWN shipped value back, numerically nothing, and the black is untouched
// (49.26% against base 49.29%). The value is what matters; the binding is fine.
// WHAT IS ESTABLISHED, and it is less than it looks: the artefact is real and scales with render distance (2f05d7f); the Fresnel cap
// is NOT the cause; raising uBody removes it. WHAT IS NOT: why a DARKER uBody also read zero black in the contaminated rows, which is
// the thing to settle first — and it needs one condition per BOOT, not a sequence in one session, because this frame does not return.
// NOTE ALSO: single rows here can be junk. This run's `fresCap 1` reported a median of 0 — a whole-frame black transient right after
// the dial change, the same trap tmp-sea-handover records. Anything read from one shot after a dial change is not a measurement.
//
//   node bench/tmp-daysea-cause.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// The SEA BAND of the offshore frame: below the horizon, above the objective line, and clear of the compass on the left.
const SEA=[0.35,0.95,0.52,0.72];
function seaStat(file){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*SEA[0])|0,x1=(P.w*SEA[1])|0,y0=(P.h*SEA[2])|0,y1=(P.h*SEA[3])|0;
  const v=[]; let b3=0,b8=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch;
    const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; v.push(l); n++; if(l<3)b3++; if(l<8)b8++; }
  v.sort((a,b)=>a-b);
  return { black:+(100*b3/n).toFixed(2), near:+(100*b8/n).toFixed(2), med:+v[v.length>>1].toFixed(1), mean:+(v.reduce((a,b)=>a+b,0)/n).toFixed(1) };
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
    const RD=+(process.env.HC_RD||8);
    await page.goto(base+'/index.html?debug=1&rd='+RD,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); try{__hc.fpsPin(240);}catch(e){} __hc.rd(${RD}); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    if(await page.evaluate(`__hc.rd()`)!==RD){ console.log('  rd did not take'); return; }
    // tmp-sea-handover's vantage exactly, because that is where the artefact was counted.
    const isle=await page.evaluate(`__hc.isleStats()`);
    const X=Math.round(isle.x)+isle.R+150, Z=Math.round(isle.z);
    await page.evaluate(`__hc.tpAt(${X}, 48, ${Z})`);
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:-0.06})`); await sleep(600);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.42)`); await sleep(560); await page.evaluate(`__hc.setTime(0.42)`); await sleep(300); };
    const shot=async tag=>{ await pin(); await sleep(300);
      // three shots, median by black share — the sea is animated and the frame after a dial change is a transient (tmp-sea-handover)
      const R=[]; for(let k=0;k<3;k++){ const f=path.join(OUT,`daysea-${tag}-${k}.png`); await page.screenshot({path:f}); R.push(seaStat(f)); await sleep(240); }
      R.sort((a,b)=>a.black-b.black); return R[1]; };
    const CONDS=[
      ['base',            ``],
      // THE NO-OP WRITE. Its own shipped value, back into the same uniform: numerically nothing changes. If the black goes here, the
      // colour is innocent and the fault is that something was never bound to this value in the first place.
      ['body NO-OP',      `(()=>{ const b=__hc.seaLook({}).body; return __hc.seaLook({body:b}); })()`],
      ['fresCap 1',       `__hc.glade({fresCap:1})`],
      ['fresCap back',    `__hc.glade({fresCap:0.42})`],
      ['body up',         `__hc.seaLook({body:[0.05,0.10,0.12]})`],
      ['body back',       `__hc.seaLook({body:[0.004,0.015,0.019]})`],
      ['foam 0',          `__hc.foam({amt:0})`],
      ['foam back',       `__hc.foam({amt:1})`],
      ['glade 0',         `__hc.glade({amt:0})`],
      ['glade back',      `__hc.glade({amt:1})`],
      ['seaNight x8',     `__hc.seaNight({amt:8})`],
      ['seaNight back',   `__hc.seaNight({amt:1})`],
    ];
    const body0=await page.evaluate(`__hc.seaLook({})`);
    console.log(`  shipped body ${JSON.stringify(body0.body)}   rd ${RD}   sea band ${JSON.stringify(SEA)}`);
    for(const [tag,js] of CONDS){
      if(js) await page.evaluate(js);
      await sleep(400);
      const s=await shot(tag.replace(/[^a-z0-9]/gi,''));
      console.log(`  ${tag.padEnd(14)} black ${String(s.black).padStart(6)}%   near-black ${String(s.near).padStart(6)}%   med ${String(s.med).padStart(6)}   mean ${s.mean}`);
    }
    console.log(`\n  READ IT LIKE THIS: whichever dial collapses the black share IS the term the black comes through. The two "back" rows`);
    console.log(`  after each change are the control — if a "back" row does not return to base, the frame drifted and the pair above it`);
    console.log(`  cannot be read. seaNight x8 must do NOTHING here: it is night-only, and that is what argues for a day-side floor.`);
    console.log(`  frames: bench/results/daysea-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
