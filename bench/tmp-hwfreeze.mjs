// Does spawning the Horrific Wretch stop the frame loop? perf-hw-cost.mjs measured 2.39 ms before the
// first spawn and exactly 0 for every window after it, on both sides — which is what a frozen game looks
// like from outside, not what an expensive creature looks like.
//
// Watches three independent clocks either side of the spawn: the game's own fpsAvg, the profiler's frame
// count, and a wall-clock rAF counter installed from here. If all three stop, the loop stopped.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
import fs from 'node:fs';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(m.type()==='error'||/horrific|drift|wretch|crash/i.test(t)) console.log('console['+m.type()+']:',t.slice(0,300)); });
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    // an independent clock, so "the loop stopped" does not rest on the game's own counters
    await page.evaluate(`(()=>{ window.__raf=0; (function tick(){ window.__raf++; requestAnimationFrame(tick); })(); })()`);
    const pr = await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.tp(${pr.spawnX}, ${pr.spawnZ}); __hc.setTime(0.85); __hc.cam({yaw:0.7,pitch:-0.05}); __hc.lock(true); })()`);
    await sleep(6000);
    const snap = async (tag) => { const a=await page.evaluate(`(()=>({ raf:window.__raf, fps:__hc.st().fps, frames:(__hc.frameProf(50)||{}).frames||0,
      hw:(__hc.hwState()||[]).length, pos:__hc.pos(), err:window._hwErr?String(window._hwErr).slice(0,200):null }))()`);
      console.log(tag, JSON.stringify(a).slice(0,320)); return a; };
    const a = await snap('before      ');
    await sleep(3000); const b = await snap('3 s later   ');
    console.log('  loop alive before spawn:', b.raf>a.raf ? 'yes ('+(b.raf-a.raf)+' rAF)' : 'NO');
    const call = await page.evaluate(`(()=>{ try{ return __hc.hw(11); }catch(e){ return {err:String(e.message||e), stack:String(e.stack||'').slice(0,300)}; } })()`);
    console.log('hw(11) ->', JSON.stringify(call).slice(0,300));
    const c = await snap('after spawn ');
    await sleep(3000); const d = await snap('3 s later   ');
    console.log('  loop alive after spawn:', d.raf>c.raf ? 'yes ('+(d.raf-c.raf)+' rAF)' : 'NO — THE FRAME LOOP STOPPED');
    await sleep(3000); const e = await snap('6 s later   ');
    console.log('  rAF total progression:', [a.raf,b.raf,c.raf,d.raf,e.raf].join(' -> '));
    console.log('  profiler frames:      ', [a.frames,b.frames,c.frames,d.frames,e.frames].join(' -> '));
    console.log('  game fpsAvg:          ', [a.fps,b.fps,c.fps,d.fps,e.fps].join(' -> '));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
