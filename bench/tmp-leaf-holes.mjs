// #68 stage 1 — the canopy's holes, and what they cost.
// A PAIRED A/B IN ONE PAGE: stand in the deep woods, measure fps with the leaf cutout on, then set leafMat.alphaTest=0
// (which makes the tile's transparent pixels render as black-on-opaque, i.e. the old always-opaque path as far as the
// rasteriser is concerned) and measure again. Same camera, same chunks, same frame, so the difference is the discard.
// node bench/tmp-leaf-holes.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    // find dense woods: a column with a canopy over it, away from spawn
    const spot = await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    console.log('woods ' + JSON.stringify(spot));
    await page.evaluate('__hc.tpAt('+(spot.x+7)+','+(spot.h+2)+','+(spot.z+7)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:120000}).catch(()=>{});
    await sleep(5000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+14)+','+spot.z+')');
    await sleep(2500);
    const fps=async()=>{ const s=[]; for(let i=0;i<12;i++){ await sleep(400); s.push((await page.evaluate('__hc.st()')).fps); } s.sort((a,b)=>a-b); return s[s.length>>1]; };
    const on = await fps();
    fs.writeFileSync(path.join(ROOT,'bench','results','leaf-holes-on.png'), await page.screenshot());
    await page.evaluate('(()=>{ __hc.leafCut(0); })()').catch(async()=>{ await page.evaluate('(()=>{ if(window.leafMat){leafMat.alphaTest=0;leafMat.needsUpdate=true;} })()'); });
    await sleep(2500);
    const off = await fps();
    fs.writeFileSync(path.join(ROOT,'bench','results','leaf-holes-off.png'), await page.screenshot());
    console.log('fps  cutout ON '+on+'   cutout OFF '+off);
    // and the same canopy at night, which is where the original lighting bug showed
    await page.evaluate('__hc.leafCut ? __hc.leafCut(0.5) : 0').catch(()=>{});
    await page.evaluate('__hc.setTime(0.75)'); await sleep(3000);
    fs.writeFileSync(path.join(ROOT,'bench','results','leaf-holes-night.png'), await page.screenshot());
    console.log('sky ' + JSON.stringify(await page.evaluate('__hc.skyProbe ? __hc.skyProbe() : "n/a"')));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
