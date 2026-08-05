// WHAT DOES THE HORRIFIC WRETCH COST? Paired, in one page.
//
// Its body is drawn by a 22 Hz feedback loop through render targets (stepHorrificDrift, timed as the
// `drift` scope), and its eye is a real light borrowed from the overworld point pool. Both are per-frame
// costs that only exist while the creature is in the world, so the honest measurement is the same camera
// with it present and absent, alternating A,B,A,B... in ONE session: that shares thermals, heap, shader
// cache and resident chunks between the two sides, and reports the median of the PER-PAIR deltas.
//
// Comparing two separate runs cannot answer this — the run-to-run spread at spawn is around ±1 ms, which is
// the same size as the effect being looked for.
//
//   node bench/perf-hw-cost.mjs --pairs 5 --dur 8
//   node bench/perf-hw-cost.mjs --dist 6        # closer: the drift loop's cost scales with screen coverage
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv = process.argv.slice(2);
const arg = (k,d)=>{ const i=argv.indexOf('--'+k); return i>=0 ? argv[i+1] : d; };
const PAIRS=+arg('pairs',5), DUR=+arg('dur',8), DIST=+arg('dist',11), NIGHT=arg('time','0.85');

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const med = a => { const s=a.slice().sort((x,y)=>x-y); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null; const A=[], B=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await page.evaluate(`(()=>{ const H=window.__hc; window.H=H; window.pr=H.probe();
      window.park=()=>{ H.tp(pr.spawnX, pr.spawnZ); H.setTime(${NIGHT}); H.cam({yaw:0.7, pitch:0}); H.pinScene(); H.lock(true); return H.pos(); };
      // HOLD ITS AI. Left to act, it captures the player in about three seconds, and the grab cutscene hides
      // the terrain and owns the camera — so the "present" side stopped measuring the creature and started
      // measuring a capture, which reads FASTER than the world it replaced (3.0-4.3 ms present against
      // 2.7-9.5 ms absent, the wrong sign). hwHold is the shipped QA switch for exactly this: the rig is
      // still built, placed, lit and drawn by the drift loop, it just does not hunt.
      window.hwOn=()=>{ H.hwHold(true); const r=H.hw(${DIST}); H.hwHold(true); return { spawned:(H.hwState()||[]).length, r }; };
      window.hwOff=()=>{ let n=0; for(const w of (H.hwState()||[])){ try{ H.hwKill(w.hid); n++; }catch(e){} } return { killed:n, left:(H.hwState()||[]).length }; };
      return window.pr; })()`);
    const ref = await page.evaluate(`__hcPERF.ref()`);
    console.log('gpu:', ref.gpu, '| the Horrific Wretch', DIST, 'm ahead, night', NIGHT, '|', PAIRS, 'pairs of', DUR, 's');

    const one = async (withHW) => {
      await page.evaluate(`park()`);
      const st = await page.evaluate(withHW ? `hwOn()` : `hwOff()`);
      // poll for the world, never sleep for it
      for(let i=0;i<40;i++){ const f=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(f) break; await sleep(500); }
      await sleep(2500);
      await page.evaluate(`__hc.pinScene(); __hc.lock(true); __hcPERF.reset();`);
      await sleep(DUR*1000);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), p=__hc.frameProf(4000), i=__hc.perf(), L=__hc.lights();
        return { median:f.median, p99:f.p99, max:f.max, over12:f.over12, over16:f.over16_6, n:f.n,
                 drift:(p.ms&&p.ms.drift)||0, wretch:(p.ms&&p.ms.wretch)||0, draw:(p.ms&&p.ms.drawBlocked)||((p.ms&&p.ms.draw)||0),
                 draws:i.calls, tris:i.tris, point:L.point, poolLit:L.poolLit, progs:i.progs,
                 hw:(__hc.hwState()||[]).length, ringFrames:(p&&p.frames)||0, perfOn:__hcPERF.flags().on, profErr:p&&p.err||null,
                 grabbed:!!__hc.st().grabbed, drawables:__hcPERF.census().drawables,
                 heap:(performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(0):null) }; })()`);
      r.setup=st; return r;
    };

    for(let p=0; p<=PAIRS; p++){                  // pair 0 is a throwaway: first-encounter compiles land in it
      const a = await one(false), b = await one(true);
      if(p===0){ console.log(`warm-up pair discarded (absent ${a.median} ms, present ${b.median} ms — includes this creature's first shader compiles)`); continue; }
      A.push(a); B.push(b);
      console.log(`pair ${p}: absent ${String(a.median).padStart(6)} ms (p99 ${a.p99})  ->  present ${String(b.median).padStart(6)} ms (p99 ${b.p99})   delta ${(b.median-a.median>=0?'+':'')}${(b.median-a.median).toFixed(3)} ms   drift ${b.drift} ms   lights ${a.point}->${b.point}  poolLit ${a.poolLit}->${b.poolLit}  hw ${a.hw}->${b.hw}`);
      // A window with no frames in it is not a fast window. Say so instead of publishing its zero.
      if(!a.n || !b.n) console.log(`  ! NO FRAMES COMMITTED in one of those windows (absent n=${a.n} ring=${a.ringFrames} perfOn=${a.perfOn} ${a.profErr||''} | present n=${b.n} ring=${b.ringFrames} perfOn=${b.perfOn} ${b.profErr||''}) — that pair is not a measurement`);
      // The two sides must differ ONLY by the creature. A grab replaces the view with the capture, and a
      // pair where one side is held and the other is not compares two different scenes.
      if(a.grabbed || b.grabbed) console.log(`  ! GRABBED during that pair (absent ${a.grabbed}, present ${b.grabbed}) — the capture hides the world, so this pair prices a cutscene, not a creature`);
      if(b.hw!==1 || a.hw!==0) console.log(`  ! ROSTER WRONG (absent ${a.hw}, present ${b.hw}) — one side did not have the world it was supposed to`);
    }
    const dMed=A.map((a,i)=>B[i].median-a.median), dP99=A.map((a,i)=>B[i].p99-a.p99), dMax=A.map((a,i)=>B[i].max-a.max);
    const wins=dMed.filter(d=>d>0).length;
    const out={ ref, dist:DIST, night:NIGHT, pairs:PAIRS, dur:DUR, A, B,
      absentMedian:med(A.map(r=>r.median)), presentMedian:med(B.map(r=>r.median)),
      pairedMedianDelta:+med(dMed).toFixed(3), pairedP99Delta:+med(dP99).toFixed(3), pairedMaxDelta:+med(dMax).toFixed(2),
      driftMs:med(B.map(r=>r.drift)), perPair:dMed.map(d=>+d.toFixed(3)),
      signTest:wins+'/'+dMed.length+' pairs slower with the creature present' };
    fs.writeFileSync(path.join(OUT,'perf-hw-cost.json'), JSON.stringify(out,null,2));
    console.log(`\nTHE HORRIFIC WRETCH COSTS: ${out.pairedMedianDelta>0?'+':''}${out.pairedMedianDelta} ms on the median frame, ${out.pairedP99Delta>0?'+':''}${out.pairedP99Delta} ms on p99, ${out.pairedMaxDelta>0?'+':''}${out.pairedMaxDelta} ms on the worst frame.`);
    console.log(`absent ${out.absentMedian} ms -> present ${out.presentMedian} ms   ${out.signTest}   per-pair [${out.perPair.join(', ')}]`);
    console.log(`its drift loop reports ${out.driftMs} ms/frame of that; the rest is the extra body, its eye light and whatever the light count does to the shaders.`);
    console.log('wrote '+path.join(OUT,'perf-hw-cost.json'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
