// THE DAY/NIGHT CYCLE, sampled across dusk. Ben: the whole cycle needs to be smooth, and night fog is still not blackness.
// Both are measurable: step the clock in small increments through sunset and read the key light, the ambient and the fog colour
// at each step. A smooth cycle has no large jump between neighbouring samples; blackness is a number.
//
// usage: node bench/tmp-daynight.mjs
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
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);

    const read=async()=>page.evaluate(`(()=>{ const s=__hc.skyState();
      return { day:s.day, sunH:s.sunH, fog:s.fog, fogL:+(0.2126*s.fog[0]+0.7152*s.fog[1]+0.0722*s.fog[2]).toFixed(4),
               key:+sunLightIntensityProbe() }; })()`).catch(async()=>{
      // sunLight is module-scoped; skyState carries the fog and day, and the key light is read through the lighting hook if present
      return page.evaluate(`(()=>{ const s=__hc.skyState(); const c=(typeof __hc.lightCensus==='function')?__hc.lightCensus():null;
        return { day:s.day, sunH:s.sunH, fog:s.fog, fogL:+(0.2126*s.fog[0]+0.7152*s.fog[1]+0.0722*s.fog[2]).toFixed(4), key:(c&&c.dirIntensity)||null }; })()`);
    });

    console.log('stepping the clock through sunset in 0.005 increments:');
    let prev=null, worst=0, worstAt=null; const samples=[];
    for(let t=0.44; t<=0.60001; t+=0.005){
      await page.evaluate('__hc.setTime('+t.toFixed(3)+')'); await sleep(260);
      const r=await read();
      if(prev){ const d=Math.abs(r.fogL-prev.fogL); if(d>worst){ worst=d; worstAt=t.toFixed(3); } }
      console.log('  t='+t.toFixed(3)+'  day='+String(r.day).padEnd(6)+' sunH='+String(r.sunH).padEnd(7)+' fogLum='+String(r.fogL).padEnd(7)+' fog=['+r.fog.join(',')+']');
      samples.push({t, fogL:r.fogL, day:r.day}); prev=r;
    }
    console.log('\nbiggest fog-luminance jump between neighbouring steps: '+worst.toFixed(4)+' at t='+worstAt);
    // A JUMP IS NOT THE SAME AS A STEEP RAMP. Sunset is the fastest part of the cycle by nature -- the sun crosses the horizon
    // quickest -- so the largest single step means nothing on its own. What would show a real discontinuity is one step far
    // larger than its neighbours. Printing the deltas in order makes that visible instead of arguable.
    { const d=[]; for(let i=1;i<samples.length;i++) d.push({t:samples[i].t, dl:+(samples[i].fogL-samples[i-1].fogL).toFixed(4)});
      console.log('  per-step fog-luminance deltas through the crossing:');
      for(const r of d) if(r.t>=0.470 && r.t<=0.530) console.log('     t='+r.t.toFixed(3)+'  d='+r.dl.toFixed(4));
      const mags=d.map(r=>Math.abs(r.dl)).sort((a,b)=>b-a);
      console.log('  largest deltas: '+mags.slice(0,5).map(v=>v.toFixed(4)).join(', ')+'   (a spike would stand alone; a ramp has neighbours its own size)'); }

    await page.evaluate('__hc.setTime(0.70)'); await sleep(1200);
    const night=await read();
    console.log('deep night: fog='+JSON.stringify(night.fog)+'  luminance '+night.fogL+'   (blackness wants this near zero)');
    await page.screenshot({path:path.join(ROOT,'bench','results','daynight-night.png')});
    await page.evaluate('__hc.fog(0.9)'); await sleep(3000);
    const nightFog=await read();
    console.log('deep night + fog bank: fog='+JSON.stringify(nightFog.fog)+'  luminance '+nightFog.fogL);
    await page.screenshot({path:path.join(ROOT,'bench','results','daynight-nightfog.png')});
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
