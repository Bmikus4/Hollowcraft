// LOOK AT A STAIRWELL. Every stair report so far has been numeric; the previous session logged "stairwells have still never
// been seen by a human eye" because __hc.look() appeared not to aim. It does aim — but it aims from camera.position, which
// only catches up with a teleport on the next rendered frame. Move, let a frame pass, THEN look.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(1500);
    await page.evaluate(`window.__hcBRX.levels(true)`); await sleep(2500);
    await page.evaluate(`__hc.aim(false)`); await page.evaluate(`__hc.qa(28)`);

    const near = await page.evaluate(`window.__hcBRX.rampNear()`);
    console.log('flight', JSON.stringify(near));
    if(!near){ console.log('no flight to shoot'); await browser.close(); return; }
    const dx=near.x1-near.x0, dz=near.z1-near.z0;
    const at=(t)=>({x:near.x0+dx*t, z:near.z0+dz*t, y:near.y0+(near.y1-near.y0)*t});
    // t=0 is the foot (y0) and t=1 the head (y1); every flight now climbs away from the chunk that owns it
    const shots=[
      ['foot',        0.02, 0.45, 'from the bottom of the well, looking up the flight'],
      ['mid',         0.45, 0.75, 'halfway up, looking at the head and the opening above it'],
      ['head-down',   0.97, 0.55, 'from the storey above, looking back down the well'],
    ];
    for(const [name,tEye,tAim,what] of shots){
      const e=at(tEye), a=at(tAim);
      await page.evaluate(`window.__hcBRX.standOnRampAt(${JSON.stringify(near)},${tEye})`);
      await sleep(900);                                                    // land on the tread AND let camera.position catch up
      const l=await page.evaluate(`__hc.look(${a.x},${a.y+1.2},${a.z})`);
      await sleep(700);
      const p=await page.evaluate(`__hc.pos()`);
      const f=path.join(OUT,'stairwell-'+name+'.png');
      await page.screenshot({path:f});
      console.log(name.padEnd(10), what);
      console.log('   eye', JSON.stringify({x:+p.x.toFixed(1),y:+p.y.toFixed(2),z:+p.z.toFixed(1),yaw:p.yaw==null?null:+p.yaw.toFixed(2),pitch:p.pitch==null?null:+p.pitch.toFixed(2)}), 'aim', JSON.stringify(l));
      console.log('   ->', f);
    }
    await browser.close();
  } finally { server.kill(); }
})();
