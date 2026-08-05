// The new flame, the embers and the light, photographed at night — one shot per kind Ben named.
// node bench/tmp-fire-shots.mjs
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
    await page.evaluate('__hc.setTime(0.86)');   // night: fire is only itself in the dark
    await page.evaluate('__hc.stillFrame(true)');
    await sleep(3000);
    for(const kind of ['torch','campfire','lantern','candle','red']){
      const r = await page.evaluate(`__hc.fireStudio('${kind}')`);
      console.log(kind + '  ' + JSON.stringify(r));
      await sleep(2600);
      fs.writeFileSync(path.join(ROOT,'bench','results','fire-'+kind+'.png'), await page.screenshot());
      console.log('   embers ' + JSON.stringify(await page.evaluate('__hc.embers()')) +
                  '  light ' + JSON.stringify(await page.evaluate('__hc.fireLight()')));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
