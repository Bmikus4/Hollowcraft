// PROBE: what are the 58 shader programs a cold boot compiles, and WHEN is each one compiled?
//
// The cold-boot pass measured 58 programs built across the first ~10 s, with draw at 13x its steady cost while it happens.
// Warming them up front is only the right fix if they are cheap to build and belong to things already on screen. The
// backrooms precompile is the cautionary case: it works, and it cost 15.8 s on the loading screen, so it ships OFF.
//
// This samples renderer.info.programs over the whole boot and prints each program the frame-window it first appears in,
// so the answer is a list, not a guess.
//
// usage: node bench/tmp-shadercensus.mjs
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
    console.log('started at '+(Date.now()-t0)+'ms');

    const seen=new Map(); let readyAt=null;
    for(let i=0;i<45;i++){
      const el=Date.now()-t0;
      const s=await page.evaluate('__hc.shaders()');
      if(s.err){ console.log('shaders(): '+s.err); break; }
      for(const p of s.list) if(!seen.has(p.id)){ seen.set(p.id,{t:el,name:p.name,key:p.key}); }
      const L=await page.evaluate('__hc.loadState()');
      if(L.initialReady && !readyAt){ readyAt=el; console.log('LOADING SCREEN HIDDEN at '+el+'ms  (programs so far: '+s.n+', icons '+L.icons+')'); }
      const f=await page.evaluate('__hc.fill()');
      if(f.meshed>=f.want){ console.log('ring visible at '+el+'ms, programs='+s.n); break; }
      await sleep(400);
    }
    await sleep(3000);
    const fin=await page.evaluate('__hc.shaders()');
    for(const p of fin.list) if(!seen.has(p.id)) seen.set(p.id,{t:Date.now()-t0,name:p.name,key:p.key});

    console.log('\ntotal programs: '+fin.n);
    const rows=[...seen.entries()].sort((a,b)=>a[1].t-b[1].t);
    const inPlay=rows.filter(r=>readyAt&&r[1].t>readyAt);
    console.log('\nloading screen hid at '+readyAt+'ms');
    console.log('compiled DURING the loading screen: '+(rows.length-inPlay.length));
    console.log('compiled IN PLAY (the stutter):     '+inPlay.length);
    console.log('\nthe IN-PLAY ones, which are the only ones worth warming:');
    for(const [id,v] of inPlay) console.log(String(v.t).padStart(8)+'ms  '+v.key);
    const kind=k=>/^depth/.test(k)?'shadow-depth':/^distanceRGBA/.test(k)?'shadow-point':/,srgb,/.test(k)?'OFF-SCREEN (icon render target)':'scene';
    const by={}; for(const [,v] of inPlay) by[kind(v.key)]=(by[kind(v.key)]||0)+1;
    console.log('\nin-play, by what they are for:');
    for(const [k,v] of Object.entries(by).sort((a,b)=>b[1]-a[1])) console.log('  '+String(v).padStart(3)+'  '+k);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
