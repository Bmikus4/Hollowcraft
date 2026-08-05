// #68 — can you actually chop the new species? treeFall walks the trunk by log id and clears the canopy by leaf id, so
// a birch or an oak missing from those sets is a tree that will not fall.  node bench/tmp-chop-species.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
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
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:800,height:600} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await sleep(2500);
    for(const [name,kind] of [['oak',1],['birch',2],['pine',0]]){
      const spot = await page.evaluate(`(()=>{ const P=__hc.probe(), px=Math.round(P.x), pz=Math.round(P.z);
        for(let r=8;r<600;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927, x=px+Math.round(Math.sin(th)*r), z=pz+Math.round(Math.cos(th)*r);
          const g=__hc.treeGates(x,z); if(g.emits && g.kind===${kind}) return {x,z,h:g.h}; } return null; })()`);
      if(!spot){ console.log(name.padEnd(6)+' no tree found'); continue; }
      await page.evaluate('__hc.tpAt('+(spot.x+3)+','+(spot.h+2)+','+(spot.z+3)+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:90000}).catch(()=>{});
      await sleep(3500);
      const r = await page.evaluate('__hc.chopAt('+spot.x+','+(spot.h+1)+','+spot.z+')');
      console.log(name.padEnd(6)+' '+JSON.stringify(r));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
