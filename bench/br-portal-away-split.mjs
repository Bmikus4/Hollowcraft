// WHY IS STANDING WITH YOUR BACK TO THE VOID DOOR THE MOST EXPENSIVE PLACE IN THE GAME? Census, current HEAD:
// br_portal_away 17.24 ms median, p99 42.3, max 123 - worse than the boss fight, worse than the halls it leads to, and
// with NO br or brPortal cost in the breakdown at all, because the on-screen gate correctly skips the portal render when
// the door is behind you. So the whole 17.9 ms of `draw` is the overworld at that spot.
//
// The odd part, and the reason this is worth splitting rather than guessing: it draws LESS than spawn does and costs
// twice as much. spawn_day is 1427 calls, 850 drawables, 657k triangles, 8.57 ms. portal_away is 658 calls, 1309
// drawables, 424k triangles, 17.24 ms. Fewer submissions and fewer triangles cannot be slower unless the cost is per
// FRAGMENT - overdraw, a fullscreen pass, or something large and transparent stacked in front of the eye.
//
// Unlike the halls, the overworld does NOT re-assert pixelScale, so __hcPERF.fill() is a live knob here and the split can
// be measured as arms in one page rather than two loads. Every arm verifies the knob actually moved (px must change) and
// that submissions did NOT, because that pair is what makes the comparison mean anything.
//
//   PRE-REGISTERED: a quarter of the pixels taking >= 40% off the median means FRAGMENT-BOUND, and the next move is to
//   find what is being shaded, not what is being submitted. Under the measured noise floor means the opposite.
//
// usage: node bench/br-portal-away-split.mjs      (runs against the tree this file sits in)
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
const med = a => { const s=[...a].sort((p,q)=>p-q); return s[s.length>>1]; };

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
    await sleep(2500);

    // The census site, reproduced from its own helper: spawn the door, stand 4 m off it, then turn 180 degrees so the
    // on-screen gate switches the portal render off and what remains is purely the overworld.
    const placed = await page.evaluate(`(()=>{ const d=__hcPERF.spawnDoor(); if(!d||d.err) return {err:JSON.stringify(d)};
      __hc.tpAt(d.x+4, d.y+1.7, d.z+0.2); __hc.cam({yaw:Math.atan2(4,0.2), pitch:0});
      __hc.cam({yaw:__hc.yawNow()+Math.PI, pitch:0}); return d; })()`);
    console.log('door: '+JSON.stringify(placed));
    await sleep(6000);

    const arm = async (label, setup) => {
      if(setup){ const r=await page.evaluate(setup); if(r!==undefined) console.log('   setup -> '+JSON.stringify(r)); }
      await page.evaluate(`window.__hcPERF.reset()`);
      await sleep(4000);
      const r = await page.evaluate(`(()=>{ const f=__hcPERF.live(), i=__hc.perf(), c=__hcPERF.census(), s=__hc.sceneState(), cv=document.querySelector('canvas');
        return { med:f.median, p99:f.p99, calls:i.calls, tris:i.tris, drawables:c.drawables, culledOff:c.culledOff,
                 shadowFaces:c.shadowFaces, px:s.pixelScale, buf:cv? cv.width+'x'+cv.height:'?',
                 portalFrames:(__hcPERF.portalRate? __hcPERF.portalRate().frames : null) }; })()`);
      console.log('  '+label.padEnd(22)+' med '+String(r.med).padStart(7)+' ms  p99 '+String(r.p99).padStart(7)+
                  '  draws '+String(r.calls).padStart(5)+'  tris '+String(Math.round(r.tris/1000)).padStart(4)+'k'+
                  '  drawables '+String(r.drawables).padStart(4)+' ('+r.culledOff+' unculled)  px '+r.px+'  buf '+r.buf);
      return r; };

    await arm('warm-up (DISCARDED)');
    const a1=await arm('fill 1.0'), a2=await arm('fill 1.0 again');
    const fullMs=[a1.med,a2.med], full=med(fullMs), floor=Math.abs(a1.med-a2.med);
    const h=await arm('fill 0.5', `window.__hcPERF.fill(0.5)`);
    const q=await arm('fill 0.25', `window.__hcPERF.fill(0.25)`);
    const back=await arm('fill 1.0 (return)', `window.__hcPERF.fill(1.0)`);

    const knob = (h.px<0.99 && q.px<0.6);
    const drift = Math.abs(h.calls-a1.calls);
    console.log('\nnoise floor between identical arms: '+floor.toFixed(3)+' ms');
    console.log('knob: px '+a1.px+' -> '+h.px+' -> '+q.px+(knob? '  (took effect)' : '  <-- INERT, the sweep is void'));
    console.log('submissions across the sweep: '+[a1,h,q].map(r=>r.calls).join(' / ')+'  drift '+drift+
                (drift>a1.calls*0.05? '  <-- VOID: resolution changed what is submitted' : '  (same scene)'));
    console.log('hysteresis: '+back.med+' ms against '+full+' at the start');
    const drop=100*(full-q.med)/full;
    console.log('\nquarter of the pixels: '+full+' -> '+q.med+' ms  ('+drop.toFixed(1)+'%)');
    console.log('half:                  '+full+' -> '+h.med+' ms  ('+(100*(full-h.med)/full).toFixed(1)+'%)');
    console.log('\nRESULT: '+(!knob? 'VOID — fill() did nothing here'
      : drift>a1.calls*0.05 ? 'VOID — see counter-metric'
      : Math.abs(full-q.med)<=floor*1.5 ? 'NOT FRAGMENT-BOUND — under the noise floor, so the cost is submissions or CPU'
      : drop>=40 ? 'FRAGMENT-BOUND ('+drop.toFixed(1)+'%) — something is being SHADED, not submitted'
      : 'PARTLY FRAGMENT-BOUND ('+drop.toFixed(1)+'%)'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
