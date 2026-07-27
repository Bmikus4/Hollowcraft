// Tier 2.2 + 2.3: pull-cord bulbs in low rooms, and the dropoff void rooms.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(6000);

    // ---- BULBS: one per low room, off at spawn, and the cord must light it
    console.log('bulbs', JSON.stringify(await page.evaluate(`window.__hcBR.bulbs()`)));
    const gb = await page.evaluate(`window.__hcBR.goBulb(0)`);
    console.log('goBulb', JSON.stringify(gb));
    if(gb){ await sleep(2200);
      await page.screenshot({ path: path.join(OUT,'v1-bulb-off.png'), clip:{x:380,y:80,width:520,height:460} });
      console.log('pull ->', JSON.stringify(await page.evaluate(`window.__hcBR.pull()`)));
      await sleep(900);
      await page.screenshot({ path: path.join(OUT,'v1-bulb-on.png'), clip:{x:380,y:80,width:520,height:460} });
    }

    // ---- DROPS: sweep seeds for the 1% rate, then stand on a ledge and look across, then step off and fall
    let tot=0, dn=0;
    for(const s of [99991,12345,777,424242,8675309,31337,90210,5150]){
      await page.evaluate(`window.__hcBR.seed(${s})`); await sleep(700);
      const h=await page.evaluate(`window.__hcBR.heights()`); const d=await page.evaluate(`window.__hcBR.drops()`);
      tot+=h.n; dn+=d.length; if(d.length) console.log('seed',s,'drops',JSON.stringify(d));
    }
    console.log('TOTAL rooms',tot,'drops',dn,'=',(100*dn/tot).toFixed(2)+'%');
    // 1% is untestable by chance, so force one and verify the geometry + the fall
    {
      await page.evaluate(`window.__hcBR.seed(99991)`); await sleep(900);
      const fd=await page.evaluate(`window.__hcBR.forceDrop()`); console.log('forceDrop', JSON.stringify(fd));
      await sleep(1200);
      await page.evaluate(`__hc.qa(70)`);
      await page.evaluate(`window.__hcBR.goDrop()`); await sleep(2600);
      await page.screenshot({ path: path.join(OUT,'v1-drop-ledge.png') });
      const y0=(await page.evaluate(`__hc.pos()`)).y;
      const probe = await page.evaluate(`(()=>{ const d=window.__hcBR.drops()[0]; if(!d)return null;
        return { atCentre:__hc.blockAt(Math.round(d.x), 40, Math.round(d.z)), onLedge:__hc.blockAt(Math.round(d.x-d.w/2+0.5), 40, Math.round(d.z)) }; })()`);
      console.log('voxel probe (0 = carved):', JSON.stringify(probe));
      await page.evaluate(`window.__hcBR.stepOff()`);
      for(let k=0;k<8;k++){ await page.evaluate(`(()=>{ if(typeof streamChunks==='function') for(let i=0;i<4;i++) streamChunks(160,160); })()`).catch(()=>{}); await sleep(400); }
      console.log('probe after stream:', JSON.stringify(await page.evaluate(`(()=>{ const d=window.__hcBR.drops()[0]; return {atCentre:__hc.blockAt(Math.round(d.x),40,Math.round(d.z)), chunk:__hc.probe().chunkHere}; })()`)));
      await page.evaluate(`__hc.aim(false)`);           // forces `locked` — without pointer lock the harness never runs movement, so nothing ever falls
      await page.evaluate(`window.__hcBR.stepOff()`);   // step off into the middle, now that it is really loaded
      for(let k=0;k<5;k++){ await sleep(400);
        console.log('  frame', k, JSON.stringify(await page.evaluate(`__hc.fallDbg()`))); }
      await sleep(1200);
      const y1=(await page.evaluate(`__hc.pos()`)).y;
      console.log('stepped off ledge: y', y0.toFixed(2), '->', y1.toFixed(2), y1<y0-3?'FELL':'DID NOT FALL');
      await page.screenshot({ path: path.join(OUT,'v1-drop-falling.png') });
    }
    console.log('errs', errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
