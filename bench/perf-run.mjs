// PERF DRIVER — runs the scripted benchmark suite (B1..B7) against a real GPU-backed Chrome and writes
// bench/results/perf-<label>-<stamp>.json plus a markdown table. Nothing here decides anything; it only
// collects. Every number in PERF_BASELINE.md / PERF_REPORT.md must come out of a file this wrote.
//
//   node bench/perf-run.mjs                       # full suite, n=5+1 warm, against index.html
//   node bench/perf-run.mjs --file game.baseline.html --label baseline
//   node bench/perf-run.mjs --quick               # 1/4 durations, n=2+1  (iteration only, NOT for reports)
//   node bench/perf-run.mjs --scenes B2,B3        # subset
//   node bench/perf-run.mjs --width 2560 --height 1440
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
const has = k => argv.includes('--'+k);

const FILE   = arg('file','index.html');
const LABEL  = arg('label', FILE==='index.html' ? 'current' : FILE.replace(/\.html$/,''));
const QUICK  = has('quick');
const RUNS   = +arg('runs', QUICK?2:5);          // reported runs (the warm-up run is extra and discarded)
const WIDTH  = +arg('width', 1920), HEIGHT = +arg('height', 1080);
const DURSCALE = QUICK ? 0.25 : 1;
// The Backrooms maze seed is normally Math.random() per door, so two runs never measure the same geometry.
// Pinning it is the only way an A/B comparison of the Backrooms means anything.
const BRSEED = +arg('brseed', 20260728);
const ONLY   = arg('scenes','') ? arg('scenes','').split(',') : null;

// scene → what the world has to be in before it can run
const PLAN = [
  { id:'B1o', world:'over',   desc:'STATIC — parked on the island surface' },
  { id:'B5o', world:'over',   desc:'SPIN — 360 yaw sweeps, overworld' },
  { id:'B2o', world:'over',   desc:'SPRINT-LINE — 60 overworld chunk borders at 10.08 m/s' },
  { id:'B3o', world:'over',   desc:'SPRINT-DIAG — 45 deg, X and Z borders together' },
  { id:'B6',  world:'portal', desc:'STRESS — orbiting the void door inside portal range' },
  { id:'B1',  world:'br',     desc:'STATIC — parked in the Backrooms entry junction' },
  { id:'B5',  world:'br',     desc:'SPIN — 360 yaw sweeps in the halls' },
  { id:'B2',  world:'br',     desc:'SPRINT-LINE — 10 BRX chunk borders (64 m each)' },
  { id:'B3',  world:'br',     desc:'SPRINT-DIAG — 45 deg across BRX borders' },
  { id:'B4',  world:'br',     desc:'TELEPORT — 10 jumps of 200+ chunks' },
];

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){
  for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if(fs.existsSync(p)) return p;
  throw new Error('no Chrome/Edge found');
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath,[path.join(ROOT,'server.js')],
    {cwd:ROOT, env:{...process.env, PORT:String(port), NO_OPEN:'1'}, stdio:'ignore'});
  const stamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  let browser=null;
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/'+FILE);
    browser = await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio',
            '--disable-frame-rate-limit','--disable-gpu-vsync','--enable-webgl-developer-extensions'] });
    const ctx = await browser.newContext({ viewport:{width:WIDTH,height:HEIGHT}, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    const pageErrors=[];
    page.on('pageerror',e=>{ const m=String(e.message||e).slice(0,240); pageErrors.push(m); console.log('PAGEERROR:',m); });

    // ---- B7 LOAD: cold page load → first interactive frame ----------------------------------------
    const tNav = Date.now();
    await page.goto(base+'/'+FILE+'?perf=1&debug=1&t=210&brseed='+BRSEED,{waitUntil:'load',timeout:120000});
    const tLoadEvent = Date.now()-tNav;
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    const tStarted = Date.now()-tNav;
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    const tInteractive = Date.now()-tNav;
    // time to steady state: 3 consecutive seconds with no frame over 16.6 ms
    await page.evaluate(`window.__hcPERF.arm()`);
    let tSteady=null;
    for(let i=0;i<60;i++){
      await page.evaluate(`window.__hcPERF.reset()`);
      await sleep(3000);
      const s = await page.evaluate(`window.__hcPERF.live()`);
      if(s && s.over16_6===0){ tSteady = Date.now()-tNav; break; }
    }
    const B7 = { loadEventMs:tLoadEvent, startedMs:tStarted, firstInteractiveMs:tInteractive, steadyStateMs:tSteady };
    console.log('B7 LOAD:', JSON.stringify(B7));

    const ref = await page.evaluate(`window.__hcPERF.ref()`);
    console.log('REF:', JSON.stringify(ref));
    if(!ref.gpuTimers) console.log('!! EXT_disjoint_timer_query_webgl2 unavailable — GPU column will be zero');

    // let the Backrooms prewarm drain so it does not compete with the overworld scenes
    for(let i=0;i<40;i++){ const pw=await page.evaluate(`window.__hcBRX?window.__hcBRX.prewarm():{queued:0}`).catch(()=>({queued:0}));
      if(!pw || pw.queued===0) break; await sleep(250); }

    // ---- the scripted scenes ----------------------------------------------------------------------
    const results = {};
    let world='over';
    for(const step of PLAN){
      if(ONLY && !ONLY.includes(step.id)) continue;
      if(step.world!==world){
        if(step.world==='portal'){ console.log('  … spawning the void door'); console.log('   ', JSON.stringify(await page.evaluate(`window.__hcPERF.spawnDoor()`))); await sleep(1500); }
        if(step.world==='br'){ console.log('  … entering the Backrooms'); console.log('   ', JSON.stringify(await page.evaluate(`window.__hcPERF.enterBR()`))); await sleep(3000); }
        world=step.world;
      }
      const runs=[];
      let repairs=0;
      for(let r=0; r<RUNS+1; r++){
        const meta = await page.evaluate(`window.__hcPERF.start(${JSON.stringify(step.id)}, {durScale:${DURSCALE}})`)
          .catch(e=>({err:String(e)}));
        if(!meta || meta.err){ console.log('  START FAILED', step.id, meta&&meta.err); break; }
        // the bench advances by a FIXED dt, so wall-clock ≥ scene seconds whenever real frames are slower than 1/140 s
        const budget = meta.dur*1000*6 + 60000;
        const t0=Date.now();
        while(await page.evaluate(`window.__hcPERF.active()`)){
          if(Date.now()-t0 > budget){ console.log('  TIMEOUT', step.id); break; }
          await sleep(250);
        }
        const res = await page.evaluate(`window.__hcPERF.result()`);
        if(!res){ console.log('  NO RESULT', step.id); break; }
        // A run that measured the WRONG WORLD is worse than no run — it reports plausible numbers for a scene
        // that never happened. The Pale used to kill the player mid-suite and every Backrooms scene after it
        // quietly benchmarked an empty overworld. Refuse the sample instead.
        const wantBR = (step.world==='br');
        if(!!res.world.brInside !== wantBR){
          res._invalid = `expected brInside=${wantBR}, got ${res.world.brInside}`;
          console.log('  INVALID', step.id, 'run'+r+':', res._invalid, '— repairing world and retrying');
          if(wantBR) await page.evaluate(`window.__hcPERF.enterBR()`); else await page.evaluate(`window.__hcPERF.exitBR()`);
          await sleep(2000);
          if(++repairs > 3){ console.log('  GIVING UP on', step.id, '— world will not hold'); break; }
          if(r>0) r--;                       // do not let a repaired attempt consume a reported run
          continue;
        }
        res._run = r; res._warm = (r===0);
        runs.push(res);
        console.log(`  ${step.id} run${r}${r===0?' (warm, discarded)':''}: med ${res.frame.median} p99 ${res.frame.p99} max ${res.frame.max} >12ms ${res.frame.over12} draws ${res.info?res.info.calls:'?'} gpu ${res.gpu.gpuTotal.median}`);
      }
      const kept = runs.filter(r=>!r._warm);
      results[step.id] = { desc:step.desc, world:step.world, runs, kept:kept.length,
        summary: summarise(kept) };
    }

    const out = { label:LABEL, file:FILE, stamp, viewport:[WIDTH,HEIGHT], runs:RUNS, quick:QUICK, brseed:BRSEED,
                  ref, B7, pageErrors, results };
    const jf = path.join(OUT, `perf-${LABEL}-${stamp}.json`);
    fs.writeFileSync(jf, JSON.stringify(out,null,2));
    fs.writeFileSync(path.join(OUT, `perf-${LABEL}-latest.json`), JSON.stringify(out,null,2));
    fs.writeFileSync(path.join(OUT, `perf-${LABEL}-${stamp}.md`), markdown(out));
    console.log('\nwrote '+jf);
    console.log('\n'+markdown(out));
  } finally {
    try{ if(browser) await browser.close(); }catch(e){}
    try{ server.kill(); }catch(e){}
  }
})().catch(e=>{ console.error(e); process.exit(1); });

// scopes that live INSIDE another scope — subtracted so the CPU total is not double counted
const NESTED = ['brPortal','brStream','brBuild','collision'];
// median of medians + inter-run spread, per the statistics discipline in the prompt (§4.9)
function summarise(runs){
  if(!runs.length) return null;
  const med = k => { const a=runs.map(k).sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; };
  const spread = k => { const a=runs.map(k); return +(Math.max(...a)-Math.min(...a)).toFixed(3); };
  const sysKeys = Object.keys(runs[0].sys);
  const sys={}; for(const s of sysKeys) sys[s] = +med(r=>r.sys[s].median).toFixed(3);
  return {
    medianMs:+med(r=>r.frame.median).toFixed(3), medianSpread:spread(r=>r.frame.median),
    p99Ms:+med(r=>r.frame.p99).toFixed(3), p99Spread:spread(r=>r.frame.p99),
    maxMs:+med(r=>r.frame.max).toFixed(3), maxSpread:spread(r=>r.frame.max),
    over12:med(r=>r.frame.over12), over16:med(r=>r.frame.over16_6),
    fpsMedian:+(1000/med(r=>r.frame.median)).toFixed(1),
    onePctLow:+(1000/med(r=>r.frame.p99)).toFixed(1),
    gpuMs:+med(r=>r.gpu.gpuTotal.median).toFixed(3),
    gpuPreMs:+med(r=>r.gpu.gpuPre.median).toFixed(3),
    gpuSceneMs:+med(r=>r.gpu.gpuScene.median).toFixed(3),
    gpuComposerMs:+med(r=>r.gpu.gpuComposer.median).toFixed(3),
    gpuPortalMs:+med(r=>r.gpu.gpuPortal.median).toFixed(3),
    cpuMs:+med(r=>NESTED.reduce((a,k)=>a-(r.sys[k]?r.sys[k].median:0), Object.values(r.sys).reduce((a,b)=>a+b.median,0))).toFixed(3),
    programs:med(r=>r.programs?r.programs.last:0), programGrowth:med(r=>r.programs?r.programs.grew:0),
    worstFrames:runs.flatMap(r=>r.worstFrames||[]).sort((a,b)=>b.ms-a.ms).slice(0,5),
    draws:med(r=>r.info?r.info.calls:0), tris:med(r=>r.info?r.info.tris:0),
    geometries:med(r=>r.info?r.info.geometries:0), textures:med(r=>r.info?r.info.textures:0),
    heapMB:med(r=>r.heap?r.heap.used:0),
    crossPerS:+med(r=>r.crossPerS).toFixed(3),
    worstFrame:runs.map(r=>r.worstFrame).sort((a,b)=>b.ms-a.ms)[0],
    sys, gates:{
      C1_median:med(r=>r.frame.median)<=7.143, C1_p99:med(r=>r.frame.p99)<=9.5,
      C2_max12:med(r=>r.frame.max)<=12, C2_zero16:med(r=>r.frame.over16_6)===0 }
  };
}

function markdown(out){
  let s = `# perf run — ${out.label}\n\n`;
  s += `- file: \`${out.file}\`  ·  stamp: ${out.stamp}  ·  viewport ${out.viewport[0]}x${out.viewport[1]}  ·  n=${out.runs} (+1 warm, discarded)\n`;
  s += `- GPU: ${out.ref.gpu}\n- ${out.ref.glver}  ·  cores ${out.ref.cores}  ·  dpr ${out.ref.dpr}  ·  drawing buffer ${out.ref.drawingBuffer.join('x')}  ·  pixelScale ${out.ref.pixelScale}\n`;
  s += `- quality ${out.ref.quality}  ·  render distance ${out.ref.renderDist}  ·  GPU timer queries: ${out.ref.gpuTimers?'yes':'NO'}\n`;
  s += `- B7 LOAD: load event ${out.B7.loadEventMs} ms · started ${out.B7.startedMs} ms · first interactive ${out.B7.firstInteractiveMs} ms · steady state ${out.B7.steadyStateMs==null?'NEVER':out.B7.steadyStateMs+' ms'}\n\n`;
  s += `| scene | world | med ms | p99 ms | max ms | >12ms | >16.6ms | fps | 1% low | CPU ms | GPU tot | ·pre | ·portal | ·scene | ·comp | draws | tris | prog (+grew) | heap MB | C1 | C2 |\n`;
  s += `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for(const k of Object.keys(out.results)){
    const r=out.results[k].summary; if(!r){ s+=`| ${k} | — | (no data) |\n`; continue; }
    s += `| **${k}** | ${out.results[k].world} | ${r.medianMs} ±${r.medianSpread} | ${r.p99Ms} ±${r.p99Spread} | ${r.maxMs} | ${r.over12} | ${r.over16} | ${r.fpsMedian} | ${r.onePctLow} | ${r.cpuMs} | ${r.gpuMs} | ${r.gpuPreMs} | ${r.gpuPortalMs} | ${r.gpuSceneMs} | ${r.gpuComposerMs} | ${r.draws} | ${r.tris} | ${r.programs} (+${r.programGrowth}) | ${r.heapMB} | ${r.gates.C1_median&&r.gates.C1_p99?'PASS':'FAIL'} | ${r.gates.C2_max12&&r.gates.C2_zero16?'PASS':'FAIL'} |\n`;
  }
  s += `\n## per-system CPU medians (ms/frame)\n\n`;
  const keys = Object.keys(out.results);
  const first = keys.map(k=>out.results[k].summary).find(Boolean);
  if(first){
    const sysNames = Object.keys(first.sys);
    s += `| scene | ${sysNames.join(' | ')} |\n|${'---|'.repeat(sysNames.length+1)}\n`;
    for(const k of keys){ const r=out.results[k].summary; if(!r) continue;
      s += `| ${k} | ${sysNames.map(n=>r.sys[n]).join(' | ')} |\n`; }
  }
  s += `\n## five worst frames per scene (across all kept runs)\n\n`;
  for(const k of keys){ const r=out.results[k].summary; if(!r) continue;
    s += `**${k}**\n`;
    for(const w of r.worstFrames) s += `  - ${w.ms} ms (gpu ${w.gpu}, prog ${w.programs}) — ${JSON.stringify(w.breakdown)}\n`; }
  if(out.pageErrors.length) s += `\n## page errors\n\n`+out.pageErrors.map(e=>'- '+e).join('\n')+'\n';
  return s;
}
