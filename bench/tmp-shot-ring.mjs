// Photograph the vitals ring with the new stamina arc and armour shields, so the layout is looked at rather than assumed.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1200);
    for(const [name,setup] of [
      ['empty', `(()=>{ for(let i=0;i<6;i++)__hc.eqPut(i,null); __hc.stamSet(100); return __hc.vitalRing(); })()`],
      ['half',  `(()=>{ __hc.eqPut(0,'leather_helmet'); __hc.eqPut(1,'leather_chestplate'); __hc.eqPut(2,'leather_leggings'); __hc.stamSet(55); return __hc.vitalRing(); })()`],
      ['full',  `(()=>{ __hc.eqPut(0,'iron_helmet'); __hc.eqPut(1,'iron_chestplate'); __hc.eqPut(2,'iron_leggings'); __hc.eqPut(3,'iron_boots'); __hc.eqPut(4,'shield'); __hc.eqPut(5,'backpack'); __hc.stamSet(18); return __hc.vitalRing(); })()`]]){
      const st=await page.evaluate(setup); await sleep(700);
      console.log(name, JSON.stringify(st));
      await page.screenshot({path:path.join(ROOT,'bench','results','ring-'+name+'.png'), clip:{x:0,y:430,width:420,height:290}});
    }
    await browser.close();
  } finally { server.kill(); }
})();
