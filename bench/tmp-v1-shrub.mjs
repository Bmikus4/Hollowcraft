// v1 item 6: is the shrub sunk? Camera sits EXACTLY at the block base plane, pitch 0, 2.5 blocks out.
// The crosshair row of the frame therefore IS the ground line: anything below it is buried.
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
const TAG = process.argv[2] || 'base';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,250)));
    await page.goto(base+'/index.html?debug=1&t=210&noshadow=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const st = await page.evaluate(`__hc.st()`); const SX=st.sx, SZ=st.sz;
    // a flat run of sand on the beach west of spawn
    await page.evaluate(`__hc.tp(${SX}-14,${SZ})`); await sleep(5000);
    const flat = await page.evaluate(`(()=>{ for(let d=6;d<40;d++){ const x=${SX}-d, z=${SZ};
        const h=[]; for(let k=0;k<4;k++){ let g=-1; for(let y=140;y>2;y--){ if(__hc.blockAt(x+k,y,z)!==0){ g=y; break; } } h.push(g); }
        if(h[0]>0 && h.every(v=>v===h[0])) return {x, z, g:h[0]}; } return null; })()`);
    console.log('flat', JSON.stringify(flat));
    if(!flat) throw new Error('no flat run');
    const BY = flat.g + 1;   // the foliage block sits here; its base plane is y = BY
    const row = await page.evaluate(`(()=>['bush','fern','berry'].map((id,i)=>__hc.setBlockAt(${flat.x}+i, ${BY}, ${flat.z}, id)))()`);
    console.log('row ids', JSON.stringify(row), 'BY', BY);
    await sleep(1800);
    // eye = pos.y + 1.62 (measured). Put the eye EXACTLY on the block base plane, pitch 0
    await page.evaluate(`__hc.tpAt(${flat.x}+1, ${BY}-1.62, ${flat.z}+2.5)`);
    await sleep(1500);
    await page.evaluate(`__hc.cam({yaw:0, pitch:0})`); await sleep(1500);
    console.log('eye', JSON.stringify(await page.evaluate(`__hc.cam({yaw:0,pitch:0})`)), JSON.stringify(await page.evaluate(`__hc.pos()`)));
    await page.evaluate(`__hc.cam({yaw:0, pitch:0})`); await sleep(900);
    await page.screenshot({ path: path.join(OUT,'v1-shrub-'+TAG+'.png'), clip:{x:360,y:230,width:560,height:320} });
    console.log('shot');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
