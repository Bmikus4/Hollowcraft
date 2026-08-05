// A 6x nearest-neighbour blow-up of the 60x60 centre of a full-ADS frame, per dot gun, so the ring can be seen as pixels after
// the pixel measurement said which quadrants are empty. node bench/tmp-holo-crop.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
const W=1280,H=720;
const GUNS=['ar15_dot','ar15_suppressed_dot','minigun_dot','minigun_suppressed_dot','hunting_rifle_dot','hunting_rifle_suppressed_dot'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1000);
    await page.evaluate(`(()=>{ const pr=__hc.probe(); __hc.tp(pr.x, pr.gyHere+2, pr.z); __hc.giveItem('rifle_ammo',200); __hc.freeze(true,false); })()`);
    await sleep(600);
    for(const g of GUNS){
      await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('${g}'); })()`); await sleep(500);
      await page.evaluate(`__hc.aim(true)`); await sleep(1600);
      await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(900);
      const d=await page.evaluate(`__hc.holoDbg()`);
      console.log(g.padEnd(30), 'offAim', d.offAimAngle, 'retNdc', JSON.stringify(d.retNdc), 'apHalf', d.apHalfAngle);
      const shot=(await page.screenshot()).toString('base64');
      const url=await page.evaluate(async (b64)=>{
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const S=60, Z=6, c=document.createElement('canvas'); c.width=c.height=S*Z;
        const x=c.getContext('2d'); x.imageSmoothingEnabled=false;
        x.drawImage(im, im.naturalWidth/2-S/2, im.naturalHeight/2-S/2, S, S, 0,0, S*Z, S*Z);
        return c.toDataURL('image/png');
      }, shot);
      fs.writeFileSync(path.join(ROOT,'bench','results','zoom-'+g+'.png'), Buffer.from(url.split(',')[1],'base64'));
      await page.evaluate(`__hc.aim(false)`); await sleep(300);
    }
    await b.close();
  } finally { server.kill(); }
})();
