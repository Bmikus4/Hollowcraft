// PAIRED A/B FOR ONE PERF FLAG, AT ANY CENSUS SITE.
//
// bench/perf-ab.mjs already does this for the six PERF.bench scenes (B1..B6). This does it for the sites in
// perf-census.mjs, because the places worth A/B-ing now — standing near a door facing away from it, turning
// on the spot, the dungeon hall — are not scenes that harness knows about.
//
// Why paired, in one page: comparing two separate census runs is the mistake PERF_PLAN §rules names outright.
// It was made here anyway, and it produced a 3.9 ms "regression" in the turning scene that paired measurement
// then had to adjudicate. Both sides now share a thermal state, a heap, a shader cache and a loaded world, and
// the reported figure is the median of the PER-PAIR deltas plus a sign test.
//
//   node bench/perf-flag-ab.mjs --flag portalOnScreen --site br_portal_away --pairs 5
//   node bench/perf-flag-ab.mjs --flag portalOnScreen --site br_portal_turn --pairs 5 --dur 12
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { SITES, HELPERS } from './perf-census.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv = process.argv.slice(2);
const arg = (k,d)=>{ const i=argv.indexOf('--'+k); return i>=0 ? argv[i+1] : d; };

const FLAG  = arg('flag','portalOnScreen');
// --onjs/--offjs price something that is NOT a flag yet: the shipped starve-one-stage hooks
// (__hcPERF.fill / nullFrag / halfObj / noShadow, __hc.owShadow) answer "which stage binds here" before any
// game code is written for it. Same pairing, same page, same sign test.
const ONJS  = arg('onjs',null), OFFJS = arg('offjs',null);
const LABEL = arg('label', ONJS?('js:'+ONJS.slice(0,40)):FLAG);
const ON    = JSON.parse(arg('on','true'));
const OFF   = JSON.parse(arg('off','false'));
const SITE  = arg('site','br_portal_away');
const PAIRS = +arg('pairs',5);
const DUR   = +arg('dur',10);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const med = a => { const s=a.slice().sort((x,y)=>x-y); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };

(async()=>{
  const site = SITES.find(s=>s.name===SITE);
  if(!site){ console.error('no such site: '+SITE+'\nknown: '+SITES.map(s=>s.name).join(',')); process.exit(1); }
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await page.evaluate(HELPERS);
    const ref = await page.evaluate(`__hcPERF.ref()`);
    // SAY WHAT IS ACTUALLY BEING PRICED. With --onjs/--offjs no flag is touched at all, and this line still printed
    // "flag portalOnScreen" — a run whose header names a flag it never set is a result nobody can trust six months on.
    console.log(`gpu: ${ref.gpu}\n${ONJS ? `js A: ${OFFJS||'(nothing)'}\njs B: ${ONJS}\n(no flag is set in this mode — --flag ${FLAG} is ignored)`
      : `flag ${FLAG}: ${JSON.stringify(OFF)} (A) vs ${JSON.stringify(ON)} (B)`}   site ${SITE}   ${PAIRS} pairs of ${DUR}s`);

    const run = body => page.evaluate(`(()=>{ try{ const r=(function(){${body}\nreturn null;})(); return r===null?'ok':r; }catch(e){ return {err:String(e&&e.message||e)}; } })()`);

    const one = async (value) => {
      await page.evaluate(`window.__census&&window.__census.stop()`);
      await page.evaluate(`window.censusReset()`);
      if(ONJS){ await page.evaluate(value===ON ? ONJS : (OFFJS||'true')); }
      else await page.evaluate(`__hcPERF.set(${JSON.stringify(FLAG)}, ${JSON.stringify(value)})`);
      const s = await run(site.setup);
      if(s && s.err) throw new Error('setup failed: '+s.err);
      if(site.move) await page.evaluate(`window.__census.start(${JSON.stringify(site.move)})`);
      for(let i=0;i<60;i++){ const ok=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(ok) break; await sleep(500); }
      await sleep(2500);
      const cam = await page.evaluate(`(()=>{ const p=__hc.pos(); return Number.isFinite(p.yaw)&&Number.isFinite(p.pitch)&&Math.abs(p.pitch)<1.4; })()`);
      if(!cam) throw new Error('camera is not aimed — refusing to measure');
      // PIN THE FRAMERATE THE ADAPTIVE LADDER READS, for the same reason perf-census does (95c2436): without it a slow window
      // sheds pixelScale mid-measurement and the "after" side is a cheaper game than the "before" side. In an A/B that is worse
      // than noise — whichever side runs while the ladder is shedding wins.
      await page.evaluate(`__hc.pinScene(); __hc.lock(true); try{__hc.fpsPin(240);}catch(e){} __hcPERF.reset();`);
      await sleep(DUR*1000);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), p=__hc.frameProf(4000), i=__hc.perf(), L=__hc.lights(), g=__hcPERF.gpu();
        return { median:f.median, p99:f.p99, max:f.max, over12:f.over12, over16:f.over16_6, n:f.n,
                 portalMs:(p.ms&&p.ms.brPortal)||0, drawMs:(p.ms&&p.ms.draw)||0,
                 draws:i.calls, progs:i.progs, progsCompiled:p.progsCompiledInWindow, point:L.point,
                 gpuTotal:g.total, gpuPre:g.pre, gpuScene:g.scene, gpuComposer:g.composer, gpuOk:g.ok,
                 // WAS THE THING BEING PRICED ACTUALLY RUNNING? volPass.enabled needs air AND a light that earns a
                 // shaft, neither of which the --onjs string can promise: at a site with no qualifying light both
                 // sides render the identical frame and the harness reports a confident zero for a pass it never ran.
                 volOn:(()=>{ try{ const v=__hc.vol(); return (v&&typeof v==='object')?(v.on?v.lights:0):null; }catch(e){ return null; } })(),
                 flag:__hcPERF.flags()[${JSON.stringify(FLAG)}] }; })()`);
      if(site.move) await page.evaluate(`window.__census.stop()`);
      if(site.teardown) await run(site.teardown);
      if(!r.n) throw new Error('no frames committed in that window — not a measurement');
      return r;
    };

    // ORDER ALTERNATES. Measuring A then B in every pair lets any warm-up effect inside a pair masquerade as
    // the flag's doing: owShadowMoveOnly appeared to take p99 from 9.4 to 5.7 ms in three pairs out of three
    // while a counter proved the gate had not skipped a single shadow refresh. Odd pairs run A,B and even
    // pairs run B,A, so a per-pair drift cancels instead of accumulating in one side's favour.
    for(let p=0; p<=PAIRS; p++){
      let a, b;
      if(p % 2 === 1){ a = await one(OFF); b = await one(ON); }
      else           { b = await one(ON);  a = await one(OFF); }
      if(p===0){ console.log(`warm-up pair discarded (A ${a.median} ms, B ${b.median} ms — first-encounter compiles land here)`); continue; }
      A.push(a); B.push(b);
      console.log(`pair ${p}: A ${String(a.median).padStart(7)} ms (p99 ${String(a.p99).padStart(6)}, max ${String(a.max).padStart(8)}, >16.6 ${String(a.over16).padStart(3)})  ->  B ${String(b.median).padStart(7)} ms (p99 ${String(b.p99).padStart(6)}, max ${String(b.max).padStart(8)}, >16.6 ${String(b.over16).padStart(3)})   delta ${(b.median-a.median>=0?'+':'')}${(b.median-a.median).toFixed(3)}   gpu ${a.gpuTotal}->${b.gpuTotal}   portalMs ${a.portalMs}->${b.portalMs}   progs+ ${a.progsCompiled}->${b.progsCompiled}   lights ${a.point}->${b.point}   volLights ${a.volOn}->${b.volOn}`);
    }
    const d = k => A.map((a,i)=>B[i][k]-a[k]);
    const dMed=d('median'), wins=dMed.filter(x=>x<0).length;
    const out = { flag:FLAG, site:SITE, on:ON, off:OFF, pairs:PAIRS, dur:DUR, A, B,
      aMedian:med(A.map(r=>r.median)), bMedian:med(B.map(r=>r.median)),
      pairedMedianDelta:+med(dMed).toFixed(3), pairedP99Delta:+med(d('p99')).toFixed(3),
      pairedMaxDelta:+med(d('max')).toFixed(2), pairedOver16Delta:med(d('over16')),
      pairedPortalMsDelta:+med(d('portalMs')).toFixed(3), pairedCompileDelta:med(d('progsCompiled')),
      pairedGpuDelta:+med(d('gpuTotal')).toFixed(3), aGpu:med(A.map(r=>r.gpuTotal)), bGpu:med(B.map(r=>r.gpuTotal)),
      // THE COMPOSER TIMER IS THE ONE THAT CAN SEE A FULLSCREEN PASS. gpuTotal carries the whole scene, whose own
      // variance at a streaming site is several milliseconds - wider than any post pass costs - so pricing a post
      // effect off the total is asking a question the instrument cannot answer. The stage timers were already being
      // collected here and thrown away at the print.
      pairedComposerDelta:+med(d('gpuComposer')).toFixed(3), aComposer:med(A.map(r=>r.gpuComposer)), bComposer:med(B.map(r=>r.gpuComposer)),
      pairedSceneDelta:+med(d('gpuScene')).toFixed(3),
      composerPerPair:d('gpuComposer').map(x=>+x.toFixed(3)),
      aDraws:med(A.map(r=>r.draws)), bDraws:med(B.map(r=>r.draws)), label:LABEL,
      perPair:dMed.map(x=>+x.toFixed(3)), signTest:`${wins}/${dMed.length} pairs faster with the flag ON` };
    fs.writeFileSync(path.join(OUT,`perf-flag-ab-${(arg('tag',FLAG)).replace(/[^\w.-]/g,'_')}-${SITE}.json`), JSON.stringify(out,null,2));
    console.log(`\n${FLAG} at ${SITE}:  ${out.aMedian} -> ${out.bMedian} ms   paired median ${out.pairedMedianDelta>0?'+':''}${out.pairedMedianDelta} ms, p99 ${out.pairedP99Delta>0?'+':''}${out.pairedP99Delta}, max ${out.pairedMaxDelta>0?'+':''}${out.pairedMaxDelta}, frames>16.6 ${out.pairedOver16Delta>0?'+':''}${out.pairedOver16Delta}`);
    console.log(`${out.signTest}   per-pair [${out.perPair.join(', ')}]   portal scope ${out.pairedPortalMsDelta} ms   extra compiles ${out.pairedCompileDelta}`);
    console.log(`gpu ${out.aGpu} -> ${out.bGpu} ms (paired ${out.pairedGpuDelta>0?'+':''}${out.pairedGpuDelta})   draws ${out.aDraws} -> ${out.bDraws}`);
    console.log(`gpu composer ${out.aComposer} -> ${out.bComposer} ms (paired ${out.pairedComposerDelta>0?'+':''}${out.pairedComposerDelta}, scene ${out.pairedSceneDelta>0?'+':''}${out.pairedSceneDelta})   per-pair [${out.composerPerPair.join(', ')}]`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
