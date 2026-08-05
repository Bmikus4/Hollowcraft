// The canopy from OUTSIDE it — transparency and the sprig fringe against the sky, which is the only place either can be
// judged. Teleport is followed by a fast screenshot: the player falls, so the shot is taken before it matters.
// node bench/tmp-canopy-shot.mjs
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
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.30)');
    await sleep(2500);
    const spot = await page.evaluate(`(()=>{ const P=__hc.probe(), px=Math.round(P.x), pz=Math.round(P.z);
      for(let r=20;r<120;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927, x=px+Math.round(Math.sin(th)*r), z=pz+Math.round(Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName,th:g.th}; } return null; })()`);
    console.log('tree ' + JSON.stringify(spot));
    if(!spot){ await browser.close(); return; }
    // GROUND SHOT FIRST. The aerial one teleports 25 blocks up and the player falls out of it — on a slow run that is
    // fatal, and every shot after it is of the death overlay.
    await page.evaluate('__hc.tp('+(spot.x+5)+','+(spot.z+5)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:120000}).catch(()=>{});
    await sleep(4500);
    await page.evaluate('__hc.pitch(0.85)'); await sleep(900);
    fs.writeFileSync(path.join(ROOT,'bench','results','canopy-up.png'), await page.screenshot());
    console.log('wrote canopy-up.png');
    const camx = spot.x+26, camz = spot.z+26, camy = spot.h + Math.max(10, (spot.th||12));
    await page.evaluate('__hc.tpAt('+camx+','+camy+','+camz+')');
    await sleep(500);
    await page.evaluate('__hc.tpAt('+camx+','+camy+','+camz+')');
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+(spot.th||12)*0.7)+','+spot.z+')');
    await sleep(220);
    fs.writeFileSync(path.join(ROOT,'bench','results','canopy-out.png'), await page.screenshot());
    console.log('wrote canopy-out.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
