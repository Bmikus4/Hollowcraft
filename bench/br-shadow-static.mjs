// THE HALLS DO NOT MOVE, SO THEIR SHADOW MAP SHOULD NOT BE REDRAWN EVERY FRAME. Two changes are under test:
//
//   1. brApplyShadowLights now DEMOTES a caster past the allowance. PERF.brShadowLights ships at 0 (Ben, 07-28: cut
//      them) and nothing acted on it - brxUpdateLights put autoUpdate straight back to true on every lit frame.
//   2. An ALLOWED caster refreshes on change (slot reassigned, something moving via brShadowDyn, or the BR_SH_EVERY
//      backstop) instead of every frame, so raising the flag buys real shadows at a fraction of the old price.
//
// Four things get counted, and each can fail independently:
//   demote     - at the shipped flag, shadowFaces must reach 0 and the draw calls must fall by ~1830.
//   static     - with the flag at 2, most frames must submit the cheap count. Sampled frame by frame: the backstop is
//                1 frame in BR_SH_EVERY=20, so a working gate shows a small fraction of expensive frames, and a broken
//                one shows all of them. This is the arm that would catch me having written a no-op.
//   responsive - a swinging door MUST refresh, or its shadow freezes open. Counted while a leaf is actually moving.
//   programs   - promoting a caster is a shader key change. If the count runs away, the saving is paid back in hitches.
//
// Warm-up is discarded and the baseline is measured twice, because the first four seconds in the halls cost about twice
// the rest and reading an arm against them is how the earlier "shadows cost 1.28 ms" claim happened.
//
// usage: node bench/br-shadow-static.mjs      (runs against the tree this file sits in)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u,t=20000)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await sleep(2000);
    const progsOverworld = (await page.evaluate(`window.__hc.perf()`)).progs;
    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(5000);
    await page.evaluate(`window.__hc.cam({yaw:0.7, pitch:0})`); await sleep(1500);

    const arm = async (label, setup) => {
      if(setup){ const r=await page.evaluate(setup); if(r!==undefined) console.log('   setup -> '+JSON.stringify(r)); }
      await page.evaluate(`window.__hcPERF.reset()`);
      await sleep(4000);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), i=__hc.perf(), c=__hcPERF.census();
        return { med:f.median, p99:f.p99, calls:i.calls, progs:i.progs, shadowFaces:c.shadowFaces, drawables:c.drawables }; })()`);
      console.log('  '+label.padEnd(26)+' med '+String(r.med).padStart(7)+' ms  p99 '+String(r.p99).padStart(7)+
                  '  draws '+String(r.calls).padStart(5)+'  shadowFaces '+String(r.shadowFaces).padStart(2)+
                  '  progs '+r.progs);
      return r; };

    // FRAME BY FRAME, not an average: the whole claim is that only a SMALL FRACTION of frames pays for the shadow pass.
    // An average cannot tell "1 frame in 20 is expensive" from "every frame is a bit cheaper".
    // ONE SAMPLE PER FRAME, taken in the page on requestAnimationFrame. Polling from out here with a 24 ms sleep does
    // NOT sample a frame: at 3 ms a frame it skips eight of them and reads whichever snapshot happens to be current,
    // which reported 32% of frames running the shadow pass while the in-page counters said 5%. The counters were right.
    // `pre` runs on the same frame the collection starts, so an event and its consequence cannot fall either side of it.
    const frames = (n, pre) => page.evaluate(`new Promise(res=>{ ${pre||''}
      const out=[]; let n=0;
      (function tick(){ out.push(window.__hc.perf().calls|0); if(++n>=${n}) return res(out); requestAnimationFrame(tick); })(); })`);
    // ABSOLUTE threshold, not a share of the observed range. A midpoint cut over a 428..437 band happily reports
    // "77.5% of frames are expensive" when there is no shadow pass running at all — which is exactly what it did report,
    // and the arm it reported on turned out to be void for an unrelated reason. A frame that renders the six cube faces
    // submits over two thousand calls; a frame that skips them submits about four hundred. SHADOW_FRAME sits between.
    const SHADOW_FRAME = 1000;
    const spread = (a) => { const high=a.filter(v=>v>SHADOW_FRAME).length;
      return { lo:Math.min(...a), hi:Math.max(...a), high, n:a.length, pctHigh:+(100*high/a.length).toFixed(1) }; };

    await arm('warm-up (DISCARDED)');
    const s1=await arm('shipped flag (0 casters)'), s2=await arm('shipped flag again');
    const fShipped = spread(await frames(40));
    console.log('   frames: '+JSON.stringify(fShipped));

    const on1=await arm('flag 2, first arm', `window.__hcPERF.shadowLights(2)`);
    const on2=await arm('flag 2, settled');
    await page.evaluate(`window.__hcBR.shWhy(true)`);            // zero the counters, then attribute every refresh
    const fStatic = spread(await frames(120));
    console.log('   frames: '+JSON.stringify(fStatic));
    const why = await page.evaluate(`window.__hcBR.shWhy()`);
    console.log('   why:    '+JSON.stringify(why));

    // RESPONSIVE: a leaf mid-swing must refresh, or its shadow stays where the door was. Sampled WHILE it moves.
    // __hcBR.useDoor toggles the NEAREST door — doorList()[0] is whatever chunk sorted first and was 100k blocks away,
    // so an arm built on it swung a door nobody could see and no caster could reach.
    // useDoor() returned ok:false with 48 doors carrying pivots — it has its own facing test — so the door is chosen
    // here by distance from the player and opened directly. Without this the arm swung nothing and reported the
    // background refresh rate as proof that swinging works.
    // The leaf must be CLOSED to have a swing, and the swing lasts about a fifth of a second — the first attempt at this
    // arm sampled for half a second starting after the animation had already finished, and read dyn:0 as "the gate
    // ignores doors". Closing first, then opening and collecting on the SAME frame, is what makes the window real.
    // The nearest CLOSED door, because there is no hook that closes one: an already-open leaf has nothing left to swing,
    // and the first version of this arm picked one at a=1.5 and then read dyn:0 as "the gate ignores doors".
    const pick = await page.evaluate(`(()=>{ const p=__hc.pos(), D=__hcBR.doorList(); let best=-1, bd=1e9;
      for(let i=0;i<D.length;i++){ if(!D[i].closed || D[i].a>0.01) continue;
        const d=Math.hypot(D[i].cx-p.x, D[i].cz-p.z); if(d<bd){ bd=d; best=i; } }
      if(best<0) return {err:'no closed door', total:D.length};
      return { i:best, dist:+bd.toFixed(1), door:D[best] }; })()`);
    console.log('\n  nearest closed door: '+JSON.stringify(pick));
    await page.evaluate(`window.__hcBR.shWhy(true)`);
    const fSwing = spread(await frames(30, `window.__hcBR.openDoor(${pick.i});`));
    console.log('  frames while a leaf swings: '+JSON.stringify(fSwing));
    console.log('  why:    '+JSON.stringify(await page.evaluate(`window.__hcBR.shWhy()`)));
    console.log('  door after: '+JSON.stringify(await page.evaluate(`window.__hcBR.doorList()[${pick.i}]`)));

    const back=await arm('flag back to 0', `window.__hcPERF.shadowLights(0)`);

    const shipped=Math.min(s1.med,s2.med), stat=Math.min(on1.med,on2.med);
    // DEMOTION is proved by the LAST arm, which asks for 0, not by the shipped default: the default is now 2, and a
    // rule that reads "shadowFaces must be 0 at the shipped flag" printed FAILED for a game doing exactly what it was
    // told. What the flag says has to be read, not assumed.
    console.log('\ndemote:     shipped flag left shadowFaces '+s1.shadowFaces+' (draws '+s1.calls+'); asking for 0 gave '+
                back.shadowFaces+' (draws '+back.calls+')   '+
                (back.shadowFaces===0? 'WORKS — the flag is live' : 'FAILED — the flag is still inert'));
    console.log('static:     flag 2 costs '+stat+' ms med against '+shipped+' ms with no casters at all;'+
                ' expensive frames '+fStatic.pctHigh+'% of 40 (draws '+fStatic.lo+'..'+fStatic.hi+')');
    console.log('            '+(on2.shadowFaces===0 ? 'VOID — the flag did not promote a caster, so nothing was gated'
                              : fStatic.pctHigh<=25 ? 'WORKS — most frames skip the shadow pass'
                              : 'FAILED — the shadow pass is still running on '+fStatic.pctHigh+'% of frames'));
    console.log('responsive: expensive frames while a leaf swings '+fSwing.pctHigh+'% of '+fSwing.n+
                '  (draws '+fSwing.lo+'..'+fSwing.hi+')  '+
                (on2.shadowFaces===0 ? 'VOID — no caster to refresh'
                 : fSwing.pctHigh>fStatic.pctHigh ? 'REFRESHES — a moving leaf costs more frames than standing still'
                 : 'FAILED — a swinging leaf did not trigger a refresh, its shadow will freeze'));
    console.log('programs:   '+progsOverworld+' in the overworld -> '+s1.progs+' at the shipped flag -> '+on2.progs+
                ' with 2 casters -> '+back.progs+' back at 0');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
