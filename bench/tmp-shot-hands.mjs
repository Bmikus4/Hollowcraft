// Photograph both hands: a block, a tool, one gun, and akimbo guns — the four cases behind "the main hand still doesnt have an
// arm for most items" and "guns in both hands should always be held by a hand".
//   node bench/tmp-shot-hands.mjs
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
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
function findBrowser(){ if(fs.existsSync(CHROME)) return CHROME; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1500);
    await page.evaluate(`__hc.cam({pitch:0.05})`);
    const shots=[
      ['block',   `(()=>{ __hc.eqPut(4,null); __hc.hold('planks'); return __hc.handsProbe(); })()`],
      ['tool',    `(()=>{ __hc.eqPut(4,null); __hc.hold('iron_pickaxe'); return __hc.handsProbe(); })()`],
      ['gun',     `(()=>{ __hc.eqPut(4,null); __hc.hold('ar15'); return __hc.handsProbe(); })()`],
      ['akimbo',  `(()=>{ __hc.hold('shotgun'); __hc.handSplit('shotgun','ar15'); return __hc.handsProbe(); })()`],
      ['shield',  `(()=>{ __hc.hold('iron_pickaxe'); __hc.eqPut(4,'shield'); return __hc.handsProbe(); })()`],
    ];
    for(const [name,setup] of shots){
      const st=await page.evaluate(setup).catch(e=>({err:String(e).slice(0,120)}));
      await sleep(800);
      console.log(name, JSON.stringify(st));
      await page.screenshot({path:path.join(ROOT,'bench','results','hands-'+name+'.png')});
    }
    await browser.close();
  } finally { server.kill(); }
})();
