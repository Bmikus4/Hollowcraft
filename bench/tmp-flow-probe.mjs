// #74 probe — does the flow field find rivers, does the shore pull inward, does the mesh carry the attribute.
// node bench/tmp-flow-probe.mjs
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
const ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.30)');
    await sleep(3000);

    console.log('flow at spawn  ' + JSON.stringify(await page.evaluate('__hc.flow()')));
    console.log('mesh           ' + JSON.stringify(await page.evaluate('__hc.flowMesh()')));
    const cen = await page.evaluate('__hc.flowCensus()');
    console.log('census river   ' + JSON.stringify(cen.river));
    console.log('census shore   ' + JSON.stringify(cen.shore));
    console.log('census open    ' + JSON.stringify(cen.open));

    // shots: a river from above, and the shore
    if(cen.river){ await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+9}, ${cen.river.z+0.5})`); await sleep(2500);
      await page.evaluate(`__hc.look(${cen.river.x+0.5}, ${cen.river.h}, ${cen.river.z+0.5})`); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-river.png'), await page.screenshot()); console.log('wrote flow-river.png'); }
    if(cen.shore){ await page.evaluate(`__hc.tpAt(${cen.shore.x+0.5}, ${cen.shore.h+6}, ${cen.shore.z+0.5})`); await sleep(2500);
      await page.evaluate(`__hc.look(${cen.shore.x+0.5+cen.shore.fx*10}, ${cen.shore.h}, ${cen.shore.z+0.5+cen.shore.fz*10})`); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-shore.png'), await page.screenshot()); console.log('wrote flow-shore.png'); }

    // how much does the surface move in 1.5 s over a river, gain on vs off
    if(cen.river){
      await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+3.2}, ${cen.river.z+0.5})`); await sleep(1800);
      await page.evaluate(`__hc.look(${cen.river.x+3}, ${cen.river.h-0.4}, ${cen.river.z+3})`); await sleep(1200);
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-river-close.png'), await page.screenshot());
      console.log('wrote flow-river-close.png  ' + JSON.stringify(await page.evaluate('__hc.flow()')));
      console.log('mesh at river  ' + JSON.stringify(await page.evaluate('__hc.flowMesh()')));
      // does the surface actually MOVE downstream? two frames 1.2 s apart, gain on then off
      const shot=async n=>{ fs.writeFileSync(path.join(ROOT,'bench','results','flow-'+n+'.png'), await page.screenshot()); };
      await page.evaluate('__hc.stillFrame(true)'); await sleep(600);
      await shot('a1'); await sleep(1200); await shot('a2');
      await page.evaluate('__hc.flow({gain:0})'); await sleep(600);
      await shot('b1'); await sleep(1200); await shot('b2');
      await page.evaluate('__hc.flow({gain:1})');
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
