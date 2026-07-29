// V7 — SOAK. Leaks are the number one cause of "it was fine for ten minutes". This loops a moving scene for a
// long time and linear-fits heap, draw calls, programs, geometries and textures against elapsed time. A leak is
// a positive slope; a healthy engine is flat.
//
// Chrome is launched with --expose-gc and gc() is called before every heap sample, so what is measured is
// RETAINED memory rather than garbage that simply has not been collected yet. Without that, every run looks
// like a leak.
//
//   node bench/perf-soak.mjs --minutes 30
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT  = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2); const arg=(k,d)=>{const i=argv.indexOf('--'+k);return i>=0?argv[i+1]:d;};
const MINUTES=+arg('minutes',30), SCENE=arg('scene','B3'), DUR=+arg('dur',20), BRSEED=+arg('brseed',20260728);

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function p(){ const r=http.get(u,x=>{x.resume();res();}); r.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// least-squares slope of y against x, plus the fraction of the starting value it represents per minute
function fit(xs, ys){
  const n=xs.length; if(n<3) return {slope:0,n};
  let sx=0,sy=0; for(let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; }
  const mx=sx/n, my=sy/n;
  let num=0, den=0; for(let i=0;i<n;i++){ num+=(xs[i]-mx)*(ys[i]-my); den+=(xs[i]-mx)**2; }
  const slope = den? num/den : 0;
  return { slope:+slope.toFixed(4), first:+ys[0].toFixed(1), last:+ys[n-1].toFixed(1), n };
}

let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null; const samples=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio',
            '--disable-gpu-vsync','--disable-frame-rate-limit','--js-flags=--expose-gc']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed='+BRSEED,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(3000);
    const hasGc = await page.evaluate(`typeof window.gc === 'function'`);
    console.log('expose-gc available:', hasGc, hasGc? '(heap figures are RETAINED memory)' : '(heap figures include uncollected garbage — treat slopes as an upper bound)');

    const t0=Date.now(), endAt=t0 + MINUTES*60000;
    let iter=0;
    while(Date.now() < endAt){
      const meta = await page.evaluate(`window.__hcPERF.start(${JSON.stringify(SCENE)}, {dur:${DUR}, warmFrames:60})`);
      if(!meta || meta.err){ console.log('start failed', meta && meta.err); break; }
      const budget = meta.dur*1000*8 + 60000, s0=Date.now();
      while(await page.evaluate(`window.__hcPERF.active()`)){
        if(Date.now()-s0>budget){ console.log('  iteration timeout'); break; }
        await sleep(250);
      }
      const r = await page.evaluate(`window.__hcPERF.result()`);
      if(!r) break;
      if(hasGc){ await page.evaluate(`window.gc(); window.gc();`); await sleep(400); }
      const mem = await page.evaluate(`(()=>{ try{ return performance.memory? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null; }catch(e){ return null; } })()`);
      const st = await page.evaluate(`window.__hcBRX.stats()`).catch(()=>({}));
      const s = { min:+((Date.now()-t0)/60000).toFixed(2), iter:++iter,
        median:r.frame.median, p99:r.frame.p99, over12:r.frame.over12,
        heap:mem, draws:r.info?r.info.calls:0, programs:r.info?r.info.programs:0,
        geometries:r.info?r.info.geometries:0, textures:r.info?r.info.textures:0,
        brGen:st.cached||0, brEnv:(await page.evaluate(`window.__hcPERF.prefetch()`).catch(()=>({}))).cached||0 };
      samples.push(s);
      console.log(`  ${String(s.min).padStart(5)} min  median ${String(s.median).padStart(6)}  heap ${String(s.heap).padStart(6)} MB  draws ${String(s.draws).padStart(5)}  prog ${String(s.programs).padStart(4)}  geo ${String(s.geometries).padStart(5)}  tex ${String(s.textures).padStart(4)}  BR.gen ${s.brGen}`);
    }

    const xs = samples.map(s=>s.min);
    const F = k => fit(xs, samples.map(s=>s[k]));
    const heap=F('heap'), draws=F('draws'), prog=F('programs'), geo=F('geometries'), tex=F('textures'), med=F('median');

    console.log('\nlinear fits (per minute):');
    for(const [n,f] of [['heap MB',heap],['draws',draws],['programs',prog],['geometries',geo],['textures',tex],['median ms',med]])
      console.log('  '+n.padEnd(12)+' slope '+String(f.slope).padStart(9)+'   '+f.first+' -> '+f.last+'  (n='+f.n+')');

    T('enough samples to fit', samples.length>=5, {samples:samples.length, minutes:MINUTES});
    // A leak shows as a persistent positive slope. Tolerances are per MINUTE and deliberately loose enough that
    // ordinary allocator drift does not trip them, tight enough that a real leak over 30 minutes cannot hide.
    T('heap does not grow', heap.slope <= 1.5, heap);
    T('draw calls do not grow', draws.slope <= 1.0, draws);
    // KNOWN OPEN DEFECT, not a threshold to be tuned away. Programs grow about 7 per minute for as long as you
    // keep walking, because three keys every shader on the LIGHT COUNT and the total point-light count still
    // moves (measured 43 / 44 / 46 in the cache keys) as streaming chunks bring their own lights in. Diagnose
    // with __hcPERF.programKeys() and __hcPERF.lightCensus(). Same root cause as the parked light-pool
    // question. Reported honestly rather than passed.
    T('programs do not grow  [KNOWN FAIL — see CHANGELOG P8]', prog.slope <= 0.2, prog);
    T('geometries do not grow', geo.slope <= 2.0, geo);
    T('textures do not grow  [tracks the program growth above]', tex.slope <= 0.2, tex);
    const firstQ=samples.slice(0, Math.max(1,Math.floor(samples.length/4)));
    const lastQ =samples.slice(-Math.max(1,Math.floor(samples.length/4)));
    const avg=a=>a.reduce((t,s)=>t+s.median,0)/a.length;
    const degr=(avg(lastQ)-avg(firstQ))/avg(firstQ)*100;
    T('median frame time does not degrade from the first quarter to the last', degr <= 15,
      { firstQuarterMs:+avg(firstQ).toFixed(3), lastQuarterMs:+avg(lastQ).toFixed(3), degradationPct:+degr.toFixed(1) });
    T('zero page errors', errs.length===0, errs.slice(0,3));

    fs.writeFileSync(path.join(OUT,'perf-soak.json'), JSON.stringify({ minutes:MINUTES, scene:SCENE, hasGc, samples,
      fits:{heap,draws,programs:prog,geometries:geo,textures:tex,median:med} },null,2));
    console.log('\nwrote bench/results/perf-soak.json');
    await browser.close(); browser=null;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
  console.log(fails? ('\n'+fails+' FAILED') : '\nALL PASS');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
