// PROBE: is the light count what causes shaders to compile in play?
//
// That is the standing hypothesis for the cold-boot stutter, carried over from the backrooms, where a MOVING point-light
// count was a compile storm and brStableLightCount fixed it by keeping unused lights visible at zero intensity.
//
// This samples the light counts three actually keys programs on -- visible point lights, shadow-casting point lights,
// directional lights and their shadows -- alongside the program count, and prints a line every time a program is
// compiled. If the light state moved on that sample, the hypothesis holds. If it is flat while programs keep appearing,
// it does not, and the answer is somewhere else.
//
// usage: node bench/tmp-lightchurn.mjs
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
const key = L => L.point+'/'+L.pointShadow+' dir '+L.dir+'/'+L.dirShadow+' spot '+L.spot+'/'+L.spotShadow;

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
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:120000});

    let lastN=0, lastKey=null, readyAt=null, compilesWithLightMove=0, compilesFlat=0;
    console.log('    time  progs  (+n)  lights point/ptShadow dir/dirShadow spot/spotShadow   poolLit  where');
    for(let i=0;i<110;i++){
      const L=await page.evaluate('__hc.lights()');
      const S=await page.evaluate('__hc.loadState()');
      const el=Date.now()-t0;
      if(S.initialReady && !readyAt) readyAt=el;
      const k=key(L);
      if(L.programs>lastN){
        const moved = (lastKey!==null && k!==lastKey);
        if(lastKey!==null){ if(moved) compilesWithLightMove+=(L.programs-lastN); else compilesFlat+=(L.programs-lastN); }
        console.log(String(el).padStart(8)+'  '+String(L.programs).padStart(5)+'  (+'+(L.programs-lastN)+')  '
          +k.padEnd(42)+'  '+String(L.poolLit).padStart(2)+'/'+L.poolSize
          +'   '+(readyAt?'IN PLAY':'loading')+(moved?'   <-- LIGHT COUNT MOVED':''));
      }
      lastN=L.programs; lastKey=k;
      await sleep(400);
    }
    console.log('\nloading screen hid at '+readyAt+'ms');
    console.log('programs compiled on a sample where the light key MOVED:  '+compilesWithLightMove);
    console.log('programs compiled while the light key was FLAT:           '+compilesFlat);
    console.log('final light state: '+key(await page.evaluate('__hc.lights()')));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
