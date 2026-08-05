// PROBE (not an assertion): where does chunk generation time actually go?
// Wraps makeChunk and treeSweepClaimed in place and reports the split, plus time-to-first-chunk at boot.
// usage: node bench/tmp-loadtime.mjs [flags]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Installed from inside module scope — the game is an ES module, so these are not globals and cannot be wrapped from here.
const INSTRUMENT = `__hc.genProf(true)`;
const REPORT = `__hc.genRead()`;

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
    await page.goto(base+'/index.html?debug=1'+FLAGS, { waitUntil:'load', timeout:120000 });
    console.log('load event          '+(Date.now()-t0)+'ms');
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:180000});
    console.log('started             '+(Date.now()-t0)+'ms');
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:180000});
    console.log('first chunk under player '+(Date.now()-t0)+'ms');
    console.log('instrument: '+await page.evaluate(INSTRUMENT));

    // profile the COLD FILL only, and stop the moment the ring is actually visible
    for(let i=0;i<60;i++){ await sleep(500);
      const f=await page.evaluate('__hc.fill()');
      if(i%4===0) console.log('  t+'+String(((Date.now()-t0)/1000).toFixed(1)).padStart(6)+'s  meshed='+String(f.meshed).padStart(4)+'/'+f.want+'  fps='+String(f.fps).padStart(3));
      if(f.meshed>=f.want){ console.log('RING RESIDENT at '+(Date.now()-t0)+'ms'); break; } }
    console.log('--- where the cold fill actually went ---');
    console.log(JSON.stringify(await page.evaluate('__hc.genRead()'),null,1));
    return;
    // force fresh generation far from spawn
    const P=await page.evaluate('__hc.pos()');
    for(const off of [[900,900],[1400,-1100],[-1600,700]]){
      await page.evaluate('__hc.tp('+(Math.round(P.x)+off[0])+','+(Math.round(P.z)+off[1])+')');
      await sleep(9000);
      console.log('after tp '+off.join(',')+':');
      console.log('  '+JSON.stringify(await page.evaluate(REPORT)));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
