import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let bad=0; const say=(ok,m,g)=>{ if(!ok)bad++; console.log((ok?'ok   ':'FAIL ')+m+'   '+JSON.stringify(g)); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await b.newContext({viewport:{width:900,height:600}});
    const page=await ctx.newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await sleep(1500);
    // Tick four objectives, and confirm they are written to storage the way a real session would.
    for(const id of ['wake','cabin','torch','tent']) await page.evaluate(`__hc.objTick&&__hc.objTick('${id}')`);
    const before=await page.evaluate(`__hc.objectives()`);
    const stored=await page.evaluate(`localStorage.getItem('hollowcraft_objectives_v1')`);
    console.log('  ticked', JSON.stringify({done:before.done, got:before.got}), 'stored?', !!stored);
    say(before.done>=1, 'objectives can be completed and are recorded', {done:before.done});
    // A NEW, UNSAVED GAME: same browser profile, same localStorage, fresh page — which is exactly what a player does.
    const page2=await ctx.newPage();
    await page2.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page2.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await sleep2000();
    const after=await page2.evaluate(`__hc.objectives()`);
    console.log('  after a new game', JSON.stringify({done:after.done, nextIdx:after.nextIdx, next:after.next, got:after.got}));
    say(after.done===0, 'a new unsaved game starts with nothing done', {done:after.done, got:after.got});
    say(after.nextIdx===0, '...and the tracker points at the first objective', {nextIdx:after.nextIdx, next:after.next});
    await b.close();
  } finally { server.kill(); }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
function sleep2000(){ return new Promise(r=>setTimeout(r,2000)); }
