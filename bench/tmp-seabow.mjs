// PROBE: how much planetary bow does the ocean horizon want?
//
// Ben: the curvature is good but "cuts off too short ... should be visible almost 500% farther out". Enlarging the ocean
// geometry cannot deliver that -- the shader works on normalize(vPos).y, a pure angle, so a cylinder at 5x the radius
// renders identically. The one coefficient that sets how far the sea bows away is uSeaBow (shipped: 0.026).
//
// Shoots the same open-water vantage at several bow values so the choice is Ben's on sight, not mine by guess.
// usage: node bench/tmp-seabow.mjs   -> bench/results/seabow-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const A = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:A });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:A.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');
    await page.evaluate('__hc.pinScene()');   // no weather, no drifting cloud, fixed exposure: the shots differ only by the dial
    await sleep(1500);

    // stand at the shore looking out to open water
    const cam = await page.evaluate(`(()=>{ const SEA=__hc.island().sea; const P=__hc.pos();
      for(let r=6;r<140;r++) for(let a=0;a<48;a++){ const th=a/48*6.2831853;
        const x=Math.round(P.x+Math.cos(th)*r*6), z=Math.round(P.z+Math.sin(th)*r*6);
        const g=__hc.surfH(x,z); if(g<SEA+1||g>SEA+5) continue;
        const dx=Math.cos(th), dz=Math.sin(th); let open=true;
        for(let s=20;s<=260;s+=10) if(__hc.surfH(Math.round(x+dx*s),Math.round(z+dz*s))>SEA){ open=false; break; }
        if(!open) continue;
        return { x, z, g, yaw:Math.atan2(-dx,-dz) }; }
      return null; })()`);
    if(!cam){ console.log('no open-ocean vantage found'); process.exit(1); }
    await page.evaluate(`__hc.tpAt(${cam.x}, ${cam.g+3}, ${cam.z})`);
    await sleep(6000);
    await page.evaluate(`__hc.cam({yaw:${cam.yaw}, pitch:0.0})`);
    await sleep(2000);

    for(const bow of [0.026, 0.078, 0.13, 0.26]){
      await page.evaluate('__hc.vis({seabow:'+bow+'})');
      await page.evaluate('__hc.setTime(0.42)'); await page.evaluate('__hc.pinScene()');
      await sleep(900);
      const tag = bow===0.026 ? 'seabow-1x-shipped' : 'seabow-'+Math.round(bow/0.026)+'x';
      await page.screenshot({ path: path.join(OUT, tag+'.png') });
      console.log('  uSeaBow='+bow+'  ('+(bow/0.026).toFixed(0)+'x shipped)  -> '+tag+'.png');
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
