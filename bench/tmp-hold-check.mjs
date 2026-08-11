// PROBE: a judged look at every hand tool — in the hand, and at hotbar size. #75 asks for a screenshot per kind
// in both places, because the two are different renderers: the hand is the live viewmodel, the hotbar is a PNG
// baked once by icon3DURL, and a tool can read well in one and be a dark smudge in the other.
// usage: node bench/tmp-tool-shots.mjs [tier]     (default iron)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const TIER = process.argv[2] || 'iron';
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
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:180000});
    // PIN THE SCENE. Left to itself the player drifts — three runs of this photographed a pickaxe handle against
    // dusk water with the head out of frame. Spawn ground, level gaze, broad daylight (uDay is 1 at t=0; night
    // runs 0.63..0.94), and a moment for the light bake to settle after the teleport.
    // spawnX/spawnZ are searched outward from (8,8) until the surface clears the sea, so they are NOT (0,0) —
    // __hc.probe() is the only place they are readable, and guessing lands you in the ocean.
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`__hc.tp(${pr.spawnX},${pr.spawnZ})`);
    await page.evaluate('__hc.setTime(0.30)');
    await sleep(2500);

    for(const id of ['iron_pickaxe','rusty_spear']){
      const r=await page.evaluate(`__hc.hold(${JSON.stringify(id)})`);
      const now=await page.evaluate('({sel:__hc.viewDbg().id, b:__hc.viewBounds()})');
      await sleep(600);
      const later=await page.evaluate('({sel:__hc.viewDbg().id, b:__hc.viewBounds()})');
      console.log(id.padEnd(14)+' hold='+JSON.stringify(r)+'  now='+now.sel+'  after600ms='+later.sel);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
