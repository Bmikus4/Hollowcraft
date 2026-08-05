// PROBE: where does the cold-boot main thread actually go?
//
// The load-time pass established that filling the ring is only ~2.4 s of chunk-streaming CPU but ~12 s of waiting, so
// ~80% of the frame during a cold boot belongs to something else. This reads the game's OWN per-frame breakdown (the T
// ring, which already has scopes on every system including four backrooms ones) rather than monkey-patching anything --
// wrapping _bulkRun from the bench page hung the probe.
//
// Ben's hypothesis is that the backrooms are involved. br / brPortal / brStream / brBuild are reported explicitly so
// that is answered with a number either way.
//
// usage: node bench/tmp-coldframe.mjs
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

function show(tag, r){
  if(r.err){ console.log(tag+': '+r.err); return; }
  console.log(tag+'  frames='+r.frames+'  avgFrame='+r.avgFrameMs+'ms  shaderPrograms='+r.progs+'  compiledInWindow='+r.progsCompiledInWindow);
  const tot=Object.values(r.ms).reduce((a,b)=>a+b,0);
  for(const [k,v] of Object.entries(r.ms))
    console.log('    '+k.padEnd(11)+String(v).padStart(8)+'ms  '+String(Math.round(100*v/(r.avgFrameMs||1))).padStart(3)+'% of frame');
  const br=(r.ms.br||0)+(r.ms.brPortal||0)+(r.ms.brStream||0)+(r.ms.brBuild||0);
  console.log('    -> BACKROOMS TOTAL '+br.toFixed(3)+'ms  ('+Math.round(100*br/(r.avgFrameMs||1))+'% of frame)');
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    const t0=Date.now();
    await page.goto(base+'/index.html?debug=1&perf=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:120000});
    console.log('started at '+(Date.now()-t0)+'ms\n');

    // Sample the breakdown DURING the fill, at intervals, then once more after the ring is visible.
    let resident=null;
    for(let i=0;i<40;i++){
      await sleep(1000);
      const f=await page.evaluate('__hc.fill()');
      if(i===2||i===5||i===9) show('t+'+((Date.now()-t0)/1000).toFixed(0)+'s DURING FILL (meshed '+f.meshed+'/'+f.want+')', await page.evaluate('__hc.frameProf(90)'));
      if(f.meshed>=f.want){ resident=Date.now()-t0; break; }
    }
    console.log('\nring visible at '+resident+'ms');
    await sleep(2500);
    show('\nSTEADY STATE (world already built)', await page.evaluate('__hc.frameProf(120)'));
    console.log('\nis the player in the backrooms? '+JSON.stringify(await page.evaluate('(()=>{try{return __hc.br?__hc.br():"(no __hc.br)";}catch(e){return String(e.message);}})()')).slice(0,200));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
