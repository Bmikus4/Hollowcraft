// FIRE: a new flame, embers in the world beside it, and E5 — the light flickering WITH the fire.
//
// Ben 08-05: "I want fire to be absolutely beautiful ... an ember particle to go alongside it ... replace the fire on
// all torches, the lantern, furnace, and campfire, and candles look good."
//
// E5 is the part with a number in it. The pool has always flickered, on its own three sines at about a tenth of a stop,
// while the flame beside it breathed on two incommensurate frequencies plus noise at nearly a third — two honest
// flickers with nothing to do with each other, which is why the shadows in a cellar never moved with the fire. The
// light now runs the flame's own expression with the flame's own seed, carried on the emitter.
//
//   1 the light's intensity is a function of the flame's flicker — sampled together, correlated
//   2 and it actually MOVES: a light that agrees with the flame by standing still proves nothing
//   3 the pool never changes size (a changed light count recompiles every lit material — a 50-300 ms hitch)
//   4 embers exist at an open fire, rise, and cool
//   5 they do NOT come off a lantern or a candle: those flames are behind glass and wax
//   6 the ember pool is capped and returns to zero when you leave the fire behind
// usage: node bench/assert-fire-embers.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };
function corr(a,b){ const n=a.length, ma=a.reduce((s,v)=>s+v,0)/n, mb=b.reduce((s,v)=>s+v,0)/n;
  let sab=0,sa=0,sb=0; for(let i=0;i<n;i++){ const da=a[i]-ma, db=b[i]-mb; sab+=da*db; sa+=da*da; sb+=db*db; }
  return (sa&&sb)? sab/Math.sqrt(sa*sb) : 0; }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:ARGS });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.86)');
    await sleep(3000);

    console.log('\n--- 4  embers come off an open fire ---');
    const cf = await page.evaluate("__hc.fireStudio('campfire')");
    console.log('  campfire ' + JSON.stringify(cf));
    // WAIT FOR THE REMESH, not a fixed two seconds. The embers ride the emitter list, and that list is rebuilt when the
    // chunk is remeshed — which is deferred by a frame or several after a block is placed. A fixed sleep read zero and
    // called the feature missing while the very next loop in this harness was counting live embers.
    let e1=null; for(let i=0;i<24;i++){ await sleep(400); e1=await page.evaluate('__hc.embers()'); if(e1.n>0) break; }
    console.log('  embers ' + JSON.stringify(e1));
    chk(e1.n>0, 'a campfire throws embers', e1.n+' live of '+e1.cap);
    chk(e1.rising>0, 'and they are going up', e1.rising+' rising');
    // Within one, not equal: emberEmit spawns from the light pool's pass and updateEmbers writes the draw count later in
    // the same frame, so a probe that lands between them legitimately sees last frame's count.
    chk(Math.abs(e1.drawn-e1.n)<=1, 'the instanced draw matches the live slots', 'drawn '+e1.drawn+' against '+e1.n+' live');
    // They cool: sample the hot fraction over a couple of seconds while emission continues. Every ember that survives
    // long enough stops being hot, so the pool can never be all-hot for long.
    let allHot=0, samples=0;
    for(let i=0;i<10;i++){ await sleep(300); const e=await page.evaluate('__hc.embers()'); if(e.n>3){ samples++; if(e.hot===e.n) allHot++; } }
    chk(samples>4 && allHot<samples, 'and they cool as they rise', (samples-allHot)+' of '+samples+' samples had cooled embers in them');

    console.log('\n--- 1+2+3  E5: the light flickers with the flame ---');
    const fl=[], inten=[]; let poolMin=99, poolMax=0;
    for(let i=0;i<60;i++){ const F=await page.evaluate('__hc.fireLight()');
      poolMin=Math.min(poolMin,F.poolSize); poolMax=Math.max(poolMax,F.poolSize);
      if(F.flicker!=null && F.lights.length){ fl.push(F.flicker); inten.push(F.lights[0].intensity); }
      await sleep(60); }
    const r=corr(fl,inten);
    const spread=(Math.max(...inten)-Math.min(...inten))/(inten.reduce((s,v)=>s+v,0)/inten.length);
    console.log('  n='+fl.length+'  corr='+r.toFixed(3)+'  flicker '+Math.min(...fl).toFixed(2)+'..'+Math.max(...fl).toFixed(2)+
                '  intensity '+Math.min(...inten).toFixed(1)+'..'+Math.max(...inten).toFixed(1));
    chk(fl.length>25, 'sampled the light and the flame together', fl.length+' paired samples');
    chk(r>0.9, 'the nearest light IS the flame\'s flicker curve', 'correlation '+r.toFixed(3));
    chk(spread>0.15, 'and it moves enough to see — this was a tenth of a stop before', 'peak-to-peak '+(spread*100).toFixed(0)+'% of mean');
    chk(poolMin===poolMax, 'the light COUNT never changed while it did', 'pool '+poolMin+' throughout');

    console.log('\n--- 5  nothing comes off a lantern or a candle ---');
    await page.evaluate('__hc.tp(__hc.probe().spawnX+40, __hc.probe().spawnZ+40)'); await sleep(4000);
    await page.evaluate('__hc.embersClear ? __hc.embersClear() : 0').catch(()=>{});
    const lan = await page.evaluate("__hc.fireStudio('lantern')"); await sleep(3500);
    const e2 = await page.evaluate('__hc.embers()');
    console.log('  lantern ' + JSON.stringify(lan) + '  embers ' + JSON.stringify(e2));
    chk(e2.n===0, 'a lantern is an enclosed flame and throws nothing', e2.n+' embers');
    const can = await page.evaluate("__hc.fireStudio('candle')"); await sleep(3500);
    const e3 = await page.evaluate('__hc.embers()');
    chk(e3.n===0, 'and neither does a candle — the one flame Ben asked me to leave alone', e3.n+' embers');

    console.log('\n--- 6  the pool drains when the fire is behind you ---');
    await page.evaluate('__hc.tp(__hc.probe().spawnX-60, __hc.probe().spawnZ-60)');
    let e4=null; for(let i=0;i<14;i++){ await sleep(500); e4=await page.evaluate('__hc.embers()'); if(e4.n===0) break; }
    chk(e4 && e4.n===0, 'no embers are left burning in an empty field', e4?e4.n+' live':'-');

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
