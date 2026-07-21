import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no chrome'); }
const ev=(p,e,a)=>p.evaluate(e,a);
// sample RAF frame deltas for `ms`, return frame-time stats (ms) + fps
async function sampleFps(page, ms){
  return await page.evaluate((ms)=>new Promise(res=>{
    const d=[]; let last=performance.now(), t0=last;
    function tick(now){ d.push(now-last); last=now; if(now-t0<ms) requestAnimationFrame(tick); else {
      d.shift(); const s=d.slice().sort((a,b)=>a-b), sum=d.reduce((a,b)=>a+b,0), P=q=>s[Math.min(s.length-1,Math.floor(q*s.length))]||0;
      res({ n:d.length, fps:+(1000/(sum/d.length)).toFixed(1), medMs:+P(0.5).toFixed(2), p95Ms:+P(0.95).toFixed(2), p99Ms:+P(0.99).toFixed(2), worstMs:+Math.max(...d).toFixed(2), stut20:d.filter(x=>x>20).length, jank33:d.filter(x=>x>33).length });
    } }
    requestAnimationFrame(tick);
  }), ms);
}
// measure the single worst frame while running an action (the transition spike)
async function spike(page, exprBefore){
  return await page.evaluate((expr)=>new Promise(res=>{
    let worst=0, last=performance.now(), t0=last, fired=false;
    function tick(now){ const dt=now-last; last=now; if(now-t0>250 && !fired){ fired=true; try{ (0,eval)(expr); }catch(e){} }
      if(dt>worst)worst=dt; if(now-t0<3000) requestAnimationFrame(tick); else res({ worstMs:+worst.toFixed(2) }); }
    requestAnimationFrame(tick);
  }), exprBefore);
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[]; const R={ tag: process.argv[2]||'baseline' };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await ev(page,`__hc.setTime(0.4)`); await sleep(800);

    R.idle = await sampleFps(page, 3000);                                        // world only, no boss

    await ev(page,`__hc.heal&&__hc.heal()`); await ev(page,`__hc.boss&&__hc.boss({dist:18})`); await sleep(1500);
    R.phase1 = await sampleFps(page, 3500);                                      // seraph up, phase 1 combat

    R.spikeWhiten = await spike(page, `__hc.whitenTest&&__hc.whitenTest()`);     // block-edit remesh spike
    await sleep(400); R.afterWhiten = await sampleFps(page, 2500);

    // enter the void (the STAGE 3 TRANSITION — the user's key concern)
    await ev(page,`__hc.heal&&__hc.heal()`);
    R.spikeVoid = await spike(page, `__hc.forcePortal&&__hc.forcePortal(); __hc.voidFloorTest&&__hc.voidFloorTest()`);
    await sleep(1200);
    R.void = await sampleFps(page, 3500);                                        // in-void fractal render

    await ev(page,`__hc.burstTest&&__hc.burstTest()`); await sleep(600);
    R.voidBursts = await sampleFps(page, 3500);                                  // stage-3 multi-eye bursts + fractal

    R.pageErrors = errors;
    fs.writeFileSync(path.join(OUT,'bossfps-'+R.tag+'.txt'), JSON.stringify(R,null,1));
    console.log(JSON.stringify(R,null,1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors, partial:R})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
