// PROBE for #65: what does fire actually COST, before anyone makes it prettier. The roster is explicit that
// performance is the risk on this item, not the look, so this builds the three scenes it names — one torch close,
// a lit room, a wall of them for a village at dusk — and reports fps and draw calls for each.
// usage: node bench/tmp-flame-perf.mjs
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

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`__hc.tp(${pr.spawnX},${pr.spawnZ})`);
    await page.evaluate('__hc.setTime(0.70)');   // dusk-into-night: fire is only worth measuring when it is what you see
    await sleep(3000);

    const fps=async(ms=4000)=>{ const s=[]; const t0=Date.now();
      while(Date.now()-t0<ms){ s.push((await page.evaluate('__hc.st()')).fps); await sleep(250); }
      s.sort((a,b)=>a-b); return { med:s[s.length>>1], min:s[0] }; };

    const scene=async(n,label)=>{
      // a block-relative grid of torches in front of the player, all in frame at once
      await page.evaluate(`(()=>{ let k=0; const side=Math.ceil(Math.sqrt(${n}));
        for(let i=0;i<side && k<${n};i++) for(let j=0;j<side && k<${n};j++){ __hc.setBlock(2+i*2, j%3, -3-((j/3)|0)*2, 'torch'); k++; }
        return k; })()`);
      // SETTLE FIRST. Every setBlock queues a remesh and a relight, and measuring through that churn reported 68 fps
      // for ONE torch and 148 for eighty-five — the number was the meshing, not the fire.
      await page.waitForFunction('(()=>{try{const q=__hc.queues?__hc.queues():null; return !q || (q.remesh===0 && q.relight===0);}catch(e){return true;}})()',{timeout:20000}).catch(()=>{});
      await sleep(5000);
      const f=await fps(); const st=await page.evaluate('__hc.st()');
      fs.writeFileSync(path.join(ROOT,'bench','results','flame-'+label.split(' ')[0]+n+'.png'), await page.screenshot({clip:{x:640,y:120,width:520,height:480}}));
      console.log('  '+label.padEnd(22)+' fps med '+String(f.med).padStart(4)+'  min '+String(f.min).padStart(4));
      return f; };

    console.log('FIRE COST at dusk, 1280x720');
    // The BASELINE needs the same settle the scenes get, or it is measured through the cold chunk fill and comes back
    // LOWER than the same world with eighty-five torches in it (49 against 150 — the first read of this probe).
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',{timeout:60000}).catch(()=>{});
    await sleep(5000);
    const clean=await fps(); console.log('  '+'no fire'.padEnd(22)+' fps med '+String(clean.med).padStart(4)+'  min '+String(clean.min).padStart(4));
    await scene(1,'one torch close');
    await scene(24,'a lit room (25)');
    await scene(60,'a village at dusk (85)');

    fs.writeFileSync(path.join(ROOT,'bench','results','flame-scene.png'), await page.screenshot());
    console.log('  wrote bench/results/flame-scene.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
