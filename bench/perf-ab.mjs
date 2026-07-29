// PAIRED A/B. Comparing two full suite runs across sessions confounds the change with thermals, chunk
// residency and whatever the JIT happened to do that day — the P1->P2 medians all landed inside the
// run-to-run spread, which is exactly the situation the protocol says to distrust.
//
// This runs BOTH sides in ONE page, alternating A,B,A,B..., so every pair shares a thermal state, a heap, a
// shader cache and a loaded world. The reported figure is the median of the PER-PAIR deltas, which cancels
// drift that hits both sides equally, plus a sign test so a consistent small win is not dismissed as noise.
//
//   node bench/perf-ab.mjs --flag brMergeRigid --scenes B1,B3,B4,B6 --pairs 5
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

const FLAG   = arg('flag','brMergeRigid');
const ON     = JSON.parse(arg('on','true'));
const OFF    = JSON.parse(arg('off','false'));
const SCENES = arg('scenes','B1,B3,B4,B6').split(',');
const PAIRS  = +arg('pairs',5);
const DUR    = arg('dur',null);            // override scene duration, seconds
const REBUILD= arg('rebuild','1')!=='0';   // build-time flags need the environment  rebuilt between sides
const BRSEED = +arg('brseed',20260728);
// Frames to burn before the ring buffer starts counting. A rebuild leaves several hundred fresh buffers to be
// uploaded on their first draw, and that transient is not what either side of the comparison is about.
const WARM   = +arg('warm', 400);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const WORLD_OF = s => s.endsWith('o') ? 'over' : (s==='B6' ? 'portal' : 'br');

async function runScene(page, scene, durOverride){
  const opts = durOverride ? `{dur:${durOverride}, warmFrames:${WARM}}` : `{warmFrames:${WARM}}`;
  const meta = await page.evaluate(`window.__hcPERF.start(${JSON.stringify(scene)}, ${opts})`);
  if(!meta || meta.err) throw new Error('start failed: '+(meta&&meta.err));
  const budget = meta.dur*1000*8 + 60000, t0=Date.now();
  while(await page.evaluate(`window.__hcPERF.active()`)){
    if(Date.now()-t0>budget) { console.log('    TIMEOUT'); break; }
    await sleep(200);
  }
  return await page.evaluate(`window.__hcPERF.result()`);
}

const med = a => { const s=a.slice().sort((x,y)=>x-y); return s.length%2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null; const out={ flag:FLAG, on:ON, off:OFF, pairs:PAIRS, scenes:{} };
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed='+BRSEED,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await sleep(2500);

    let world='over';
    for(const scene of SCENES){
      const want=WORLD_OF(scene);
      if(want!==world){
        if(want==='portal'){ await page.evaluate(`window.__hcPERF.spawnDoor()`); await sleep(1500); }
        if(want==='br'){ await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(3500); }
        if(want==='over' && world!=='over'){ await page.evaluate(`window.__hcPERF.exitBR()`); await sleep(2000); }
        world=want;
      }
      const A=[], B=[];
      // one throwaway pair first: the very first run of a scene carries its shader compiles and cache misses
      for(let p=0; p<PAIRS+1; p++){
        for(const side of ['A','B']){
          await page.evaluate(`window.__hcPERF.set(${JSON.stringify(FLAG)}, ${JSON.stringify(side==='A'?OFF:ON)})`);
          if(REBUILD && want!=='over'){ await page.evaluate(`window.__hcPERF.rebuildEnv()`); await sleep(3000); }
          const r = await runScene(page, scene, DUR);
          if(!r) { console.log('  no result', scene, side); continue; }
          if(p===0) continue;                                   // warm pair, discarded
          (side==='A'?A:B).push(r);
        }
      }
      if(!A.length || !B.length){ console.log('  '+scene+': no data'); continue; }
      const n=Math.min(A.length,B.length);
      const dMed=[], dP99=[], dMax=[], dOver12=[];
      for(let i=0;i<n;i++){
        dMed.push(B[i].frame.median - A[i].frame.median);
        dP99.push(B[i].frame.p99    - A[i].frame.p99);
        dMax.push(B[i].frame.max    - A[i].frame.max);
        dOver12.push(B[i].frame.over12 - A[i].frame.over12);
      }
      const wins = dMed.filter(d=>d<0).length;
      const rec = {
        n, aMedian:+med(A.map(r=>r.frame.median)).toFixed(3), bMedian:+med(B.map(r=>r.frame.median)).toFixed(3),
        pairedMedianDelta:+med(dMed).toFixed(3), pairedP99Delta:+med(dP99).toFixed(3),
        pairedMaxDelta:+med(dMax).toFixed(2), pairedOver12Delta:med(dOver12),
        signTest:wins+'/'+n+' pairs faster with the flag on',
        aDraws:med(A.map(r=>r.info?r.info.calls:0)), bDraws:med(B.map(r=>r.info?r.info.calls:0)),
        aHeap:med(A.map(r=>r.heap?r.heap.used:0)), bHeap:med(B.map(r=>r.heap?r.heap.used:0)),
        // Shader compiles are the other thing that produces long frames, so attribute them rather than
        // blaming whichever flag happens to be under test.
        aProgGrew:med(A.map(r=>r.programs?r.programs.grew:0)), bProgGrew:med(B.map(r=>r.programs?r.programs.grew:0)),
        aProgEvents:med(A.map(r=>r.programs?r.programs.growthEvents:0)), bProgEvents:med(B.map(r=>r.programs?r.programs.growthEvents:0)),
        perPairMedianDelta:dMed.map(d=>+d.toFixed(3)),
        aWorst:A.flatMap(r=>r.worstFrames||[]).sort((x,y)=>y.ms-x.ms).slice(0,4),
        bWorst:B.flatMap(r=>r.worstFrames||[]).sort((x,y)=>y.ms-x.ms).slice(0,4),
      };
      out.scenes[scene]=rec;
      console.log(`\n${scene}:  off ${rec.aMedian} ms  ->  on ${rec.bMedian} ms`);
      console.log(`  paired delta  median ${rec.pairedMedianDelta>0?'+':''}${rec.pairedMedianDelta} ms   p99 ${rec.pairedP99Delta>0?'+':''}${rec.pairedP99Delta}   max ${rec.pairedMaxDelta>0?'+':''}${rec.pairedMaxDelta}   >12ms ${rec.pairedOver12Delta>0?'+':''}${rec.pairedOver12Delta}`);
      console.log(`  ${rec.signTest}   draws ${rec.aDraws} -> ${rec.bDraws}   heap ${rec.aHeap} -> ${rec.bHeap} MB`);
      console.log(`  shader compiles during the run: off ${rec.aProgEvents} (+${rec.aProgGrew} programs)  on ${rec.bProgEvents} (+${rec.bProgGrew})`);
      console.log(`  per-pair: [${rec.perPairMedianDelta.join(', ')}]`);
      const show = (tag,w)=>{ console.log('  worst '+tag+':'); for(const f of w)
        console.log('    '+f.ms+' ms (gpu '+f.gpu+', prog '+f.programs+') '+JSON.stringify(f.breakdown)); };
      show('OFF', rec.aWorst); show('ON ', rec.bWorst);
      if(REBUILD && want!=='over') console.log('  NOTE: p99/max/>12ms above are NOT trustworthy for build-time flags — this'
        + ' harness tears down and rebuilds ' + 'the loaded chunks before every run, and that churn produces long frames on'
        + ' BOTH sides that gameplay never sees. Take the tail from bench/perf-run.mjs, which enters once. Medians and draw'
        + ' counts are measured after ' + WARM + ' warm frames and are fine.');
    }
    const f=path.join(OUT,`perf-ab-${FLAG}.json`);
    fs.writeFileSync(f, JSON.stringify(out,null,2));
    console.log('\nwrote '+f);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
