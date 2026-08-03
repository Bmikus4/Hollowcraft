// DOES THE GAME GET SLOWER THE MORE OF THE WORLD YOU VISIT?
//
// perf-census.mjs measured the SAME camera at spawn twice in one session, half an hour of visiting apart:
// 7.94 ms the first time and 14-16 ms later, with draw calls 875 -> 1600, visible point lights 18 -> 46 and
// the heap 111 -> 224 MB. Either the census sites leak state into each other, or a session that has walked
// around the island is permanently slower than one that has not. A player does the second thing, so it
// matters which.
//
// This measures ONE camera, at spawn, over and over, with a controlled excursion between measurements, and
// reports the world's own accounting each time. No opinion about the cause is built in: it prints chunks,
// drawables, unculled drawables, draws, point lights, programs and heap alongside the frame time, so
// whichever of them tracks the slowdown identifies itself.
//
//   node bench/perf-visit-drift.mjs                 # 6 laps of: measure spawn, excurse, come back
//   node bench/perf-visit-drift.mjs --laps 10 --dur 8
//   node bench/perf-visit-drift.mjs --excursion none # control: measure the same spot with NO travel
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

const LAPS = +arg('laps', 6);
const DUR  = +arg('dur', 8);
const SETTLE = +arg('settle', 5);
const EXC  = arg('excursion', 'ring');   // ring | none | far

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null; const laps=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await page.evaluate(`(()=>{ const H=window.__hc; window.H=H; window.pr=H.probe();
      window.goSpawn=()=>{ H.tp(pr.spawnX, pr.spawnZ); H.look(0.7,-0.05); H.setTime(0.35); H.lock(true); return H.pos(); };
      return window.pr; })()`);
    const ref = await page.evaluate(`__hcPERF.ref()`);
    console.log('gpu:', ref.gpu, '| rd', ref.renderDist, '| excursion mode:', EXC);

    const measure = async (label) => {
      await page.evaluate(`goSpawn()`);
      await sleep(SETTLE*1000);
      await page.evaluate(`__hc.pinScene(); __hc.lock(true); __hcPERF.reset();`);
      await sleep(DUR*1000);
      const dc = await page.evaluate(`__hcPERF.drawCensus()`);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), i=__hc.perf(), c=__hcPERF.census(), L=__hc.lights(), fi=__hc.fill();
        return { median:f.median, p99:f.p99, max:f.max, over12:f.over12, n:f.n,
                 draws:i.calls, tris:i.tris, progs:i.progs, drawables:c.drawables, culledOff:c.culledOff,
                 shadowFaces:c.shadowFaces, byOwner:c.byOwner, point:L.point, pointShadow:L.pointShadow,
                 chunks:fi.chunks, meshed:fi.meshed, want:fi.want, rd:fi.rd,
                 px:__hc.sceneState().pixelScale,
                 heap:(performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(0):null) }; })()`);
      r.label=label; r.drawCensus=dc; laps.push(r);
      console.log(`  bands in_reach ${dc.bands.in_reach}  past_fog ${dc.bands.past_reach}  past_far ${dc.bands.past_far}   fogReach ${dc.fogReach}m  camFar ${dc.camFar}m  frustumCullOff ${dc.frustumCullOff} (${dc.frustumCullOffPastReach} of them past the fog)`);
      console.log(`  top: `+dc.top.slice(0,6).map(t=>`${t.label}x${t.n}${t.pastReach?('/'+t.pastReach+'past'):''}`).join('  '));
      console.log(`${label.padEnd(9)} ${String(r.median).padStart(7)} ms  p99 ${String(r.p99).padStart(6)}  >12 ${String(r.over12).padStart(4)}  | chunks ${String(r.chunks).padStart(4)} meshed ${r.meshed}/${r.want}  draws ${String(r.draws).padStart(5)}  drawables ${String(r.drawables).padStart(5)} (${r.culledOff} unculled)  point ${String(r.point).padStart(3)}  prog ${String(r.progs).padStart(4)}  px ${r.px}  heap ${r.heap}MB`);
      return r;
    };

    // An excursion is what a player does between two visits to the same place: walk somewhere else far
    // enough that a completely different set of chunks is resident, then come back.
    const excurse = async (lap) => {
      if(EXC==='none') return;
      // The interesting excursion is not distance, it is VISITING THINGS: each landmark runs its own
      // builder, and a builder that parents props to the scene has no counterpart that takes them out.
      if(EXC==='structures'){
        const stops=['village','chapel','cabin','golgotha','dungeon'];
        const stop=stops[lap%stops.length];
        const where = await page.evaluate(`(()=>{ const s=${JSON.stringify(stop)};
          try{
            if(s==='village'){ const r=H.qaVillage(); if(r&&r.x!=null) H.tp(r.x,r.z); return {s, r}; }
            if(s==='chapel'){ const c=H.church(); if(c&&c.x!=null) H.tp(c.x,c.z); return {s, c}; }
            if(s==='cabin'){ H.tp(pr.spawnX+22, pr.spawnZ-14); return {s}; }
            if(s==='golgotha'){ const g=H.golgotha(); if(g&&g.x!=null) H.tp(g.x+16,g.z+16); return {s, g}; }
            if(s==='dungeon'){ const L=H.lairInfo(); if(L){ H.tp((L.cx!=null?L.cx:L.x),(L.cz!=null?L.cz:L.z));
              const L2=H.lairInfo(); if(L2&&L2.fy!=null) H.tpAt((L2.cx!=null?L2.cx:L2.x), L2.fy+1.8, (L2.cz!=null?L2.cz:L2.z)); } return {s, L:H.lairInfo()}; }
          }catch(e){ return {s, err:String(e.message||e)}; }
          return {s}; })()`);
        console.log('   excursion ->', JSON.stringify(where).slice(0,150));
        await sleep(9000);
        return;
      }
      const r = EXC==='far' ? 900 : 260;
      await page.evaluate(`(()=>{ const a=${lap}*1.7, R=${r};
        H.tp(Math.round(pr.spawnX+Math.cos(a)*R), Math.round(pr.spawnZ+Math.sin(a)*R)); return H.pos(); })()`);
      await sleep(6000);
    };

    for(let lap=0; lap<LAPS; lap++){
      await measure('lap'+lap);
      await excurse(lap);
    }

    const f=path.join(OUT,`perf-visit-drift-${EXC}.json`);
    fs.writeFileSync(f, JSON.stringify({ref, exc:EXC, dur:DUR, laps},null,2));
    const first=laps[0], last=laps[laps.length-1];
    const d=(k)=>`${first[k]} -> ${last[k]}`;
    console.log(`\nover ${LAPS} laps at the SAME camera: median ${d('median')} ms, draws ${d('draws')}, drawables ${d('drawables')}, unculled ${d('culledOff')}, point lights ${d('point')}, programs ${d('progs')}, chunks ${d('chunks')}, heap ${d('heap')} MB`);
    console.log('wrote '+f);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
