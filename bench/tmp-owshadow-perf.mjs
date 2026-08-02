// COST OF THE OVERWORLD TORCH-SHADOW CASTER. The FPS pass landed on main hours before this, so a new per-frame
// shadow pass is the one thing that could quietly undo it. A point light's shadow is SIX cube faces, so this
// measures frame time with the caster on and off, at night, standing in torchlight — interleaved A/B/A/B so a
// thermal drift or a streaming burst cannot masquerade as the effect.
// usage: node bench/tmp-owshadow-perf.mjs
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Sample rAF deltas in-page for ms, return median + p95 (mean is hostage to one GC pause).
const SAMPLE = (ms) => `(()=>new Promise(res=>{ const d=[]; let last=performance.now(); const t0=last;
  function tick(){ const n=performance.now(); d.push(n-last); last=n;
    if(n-t0 < ${ms}) requestAnimationFrame(tick);
    else { d.sort((a,b)=>a-b); res({ n:d.length, med:+d[d.length>>1].toFixed(2), p95:+d[Math.floor(d.length*0.95)].toFixed(2) }); } }
  requestAnimationFrame(tick); }))()`;

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl=`(()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'NO';const e=g.getExtension('WEBGL_debug_renderer_info');return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`, {timeout:90000});
    console.log('GPU', await page.evaluate(gl));
    await page.evaluate(`__hc.setTime(0.72)`);           // night — the case where this caster is the only one
    await sleep(2000);
    // a cluster of torches around the player so the caster always has a light, plus the Wretch in view to be shadowed
    await page.evaluate(`(()=>{ const P=__hc.pos(); const bx=Math.floor(P.x), bz=Math.floor(P.z);
      for(const [dx,dz] of [[3,0],[-3,0],[0,3],[0,-3],[5,5],[-5,-5]]) __hc.place2(bx+dx, bz+dz, 'torch', 0);
      __hc.summon(); __hc.put(4,1); })()`);
    await sleep(6000);
    console.log('state', JSON.stringify(await page.evaluate(`__hc.owShadow()`)));

    const res={on:[],off:[]};
    for(let round=0; round<3; round++){
      for(const n of [1,0]){
        await page.evaluate(`__hc.owShadow(${n})`);
        await sleep(1500);                                        // settle
        const s = await page.evaluate(SAMPLE(4000));
        res[n?'on':'off'].push(s);
        console.log('round'+round, n?'ON ':'OFF', JSON.stringify(s));
      }
    }
    const med=(a)=>{ const v=a.map(x=>x.med).sort((p,q)=>p-q); return v[v.length>>1]; };
    const p95=(a)=>{ const v=a.map(x=>x.p95).sort((p,q)=>p-q); return v[v.length>>1]; };
    console.log('---');
    console.log('caster ON  median frame '+med(res.on).toFixed(2)+' ms  (p95 '+p95(res.on).toFixed(2)+')  ~'+(1000/med(res.on)).toFixed(0)+' fps');
    console.log('caster OFF median frame '+med(res.off).toFixed(2)+' ms  (p95 '+p95(res.off).toFixed(2)+')  ~'+(1000/med(res.off)).toFixed(0)+' fps');
    console.log('delta '+(med(res.on)-med(res.off)).toFixed(2)+' ms/frame');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
