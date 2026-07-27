// Tier 2.4: tilted rooms (sloped floor you walk up) and vertical rooms (a three-storey shaft with a ladder).
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

    // natural rate across seeds
    let tot=0, ti=0, sh=0;
    for(const s of [99991,12345,777,424242,8675309,31337,90210,5150]){
      await page.evaluate(`window.__hcBR.seed(${s})`); await sleep(650);
      const h=await page.evaluate(`window.__hcBR.heights()`);
      tot+=h.n; ti+=(await page.evaluate(`window.__hcBR.tilts()`)).length; sh+=(await page.evaluate(`window.__hcBR.shafts()`)).length;
    }
    console.log('rooms',tot,'tilted',ti,'('+(100*ti/tot).toFixed(2)+'%)','shafts',sh,'('+(100*sh/tot).toFixed(2)+'%)');

    // ---- TILTED: force one, walk up it, confirm the player rises
    await page.evaluate(`window.__hcBR.seed(99991)`); await sleep(900);
    console.log('forceRoom tilt', JSON.stringify(await page.evaluate(`window.__hcBR.forceRoom('tilt')`)));
    await sleep(1100); await page.evaluate(`__hc.qa(70)`);
    console.log('tilts', JSON.stringify(await page.evaluate(`window.__hcBR.tilts()`)));
    await page.evaluate(`window.__hcBR.goRoom('tilt')`); await sleep(2200);
    await page.screenshot({ path: path.join(OUT,'v1-tilt.png') });
    { const lo=(await page.evaluate(`__hc.pos()`)).y;
      const hi=await page.evaluate(`(()=>{ const t=window.__hcBR.tilts()[0]; if(!t)return null;
        __hc.aim(false); return t; })()`);
      // teleport to the high end and let the ramp support catch us
      await page.evaluate(`(()=>{ const t=window.__hcBR.tilts()[0]; __hc.tpAt(t.x + 8, 41.5, t.z); })()`).catch(()=>{});
      await sleep(1400);
      const hy=(await page.evaluate(`__hc.pos()`)).y;
      console.log('tilt floor: low end y', lo.toFixed(2), '| high end y', hy.toFixed(2), hy>lo+0.6?'RAMP HOLDS':'FLAT');
    }

    // ---- VERTICAL: force one, climb the ladder
    console.log('forceRoom shaft', JSON.stringify(await page.evaluate(`window.__hcBR.forceRoom('shaft')`)));
    await sleep(1200);
    console.log('shafts', JSON.stringify(await page.evaluate(`window.__hcBR.shafts()`)));
    await page.evaluate(`window.__hcBR.goRoom('shaft')`); await sleep(2000);
    await page.screenshot({ path: path.join(OUT,'v1-shaft.png') });
    { await page.evaluate(`__hc.aim(false)`);
      const y0=(await page.evaluate(`__hc.pos()`)).y;
      // stand on the ladder and hold W
      await page.evaluate(`(()=>{ const s=window.__hcBR.shafts()[0]; const r=(BR&&0); })()`).catch(()=>{});
      await page.evaluate(`window.__hcBR.onLadder && window.__hcBR.onLadder()`).catch(()=>{});
      await page.keyboard.down('KeyW');
      for(let k=0;k<6;k++){ await sleep(500); }
      await page.keyboard.up('KeyW');
      const y1=(await page.evaluate(`__hc.pos()`)).y;
      console.log('ladder climb: y', y0.toFixed(2), '->', y1.toFixed(2), y1>y0+2?'CLIMBED':'DID NOT CLIMB');
      await page.screenshot({ path: path.join(OUT,'v1-shaft-up.png') });
    }
    console.log('errs', errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
