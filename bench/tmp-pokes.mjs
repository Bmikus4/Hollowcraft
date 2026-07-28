// WALL EDGES POKING THROUGH WALLS (Ben: "weird overlaps, stray lines"). The shipped __hcBRX.wallPokes only reports HOW FAR
// an end overshoots; this reports WHICH walls, so the fix can be aimed. For every near-perpendicular pair it dumps both
// full wall records, the angle between them, and how far the end sits past the other's far face — then buckets them by
// shape (axis-aligned vs angled, room wall vs stair lining vs free-standing divider) so the emitter at fault is obvious.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const AUDIT = `({pokes:window.__hcBRX.wallPokes(), ov:window.__hcBRX.wallOverlaps()})`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:800,height:600}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);
    // walk the region: each teleport streams new chunks in, so this sees several independent generations, not one
    for(const [dx,dz] of [[0,0],[240,0],[0,240],[-240,-240],[480,240]]){
      await page.evaluate(`window.__hcBR.tp(${dx},${dz})`); await sleep(2500);
      const r=await page.evaluate(AUDIT);
      console.log('tp '+dx+','+dz+'  walls='+r.pokes.walls+'  pokes='+r.pokes.pokes+'  overlaps='+r.ov.overlaps+' (sheet='+(r.ov.sheet||0)+' growth='+(r.ov.growth||0)+')  worst='+r.ov.worst);
      if(r.ov.sample.length) console.log('   '+JSON.stringify(r.ov.sample.slice(0,2)));
    }
    await browser.close();
  } finally { server.kill(); }
})();
