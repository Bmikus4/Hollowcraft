import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=u=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const r=http.get(u,x=>{x.resume();res();});r.on('error',()=>Date.now()-t0>20000?rej(new Error('down')):setTimeout(p,250));})();});
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await b.newPage({viewport:{width:1280,height:720}});
await page.goto(base+'/index.html?debug=1',{waitUntil:'load'});
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
await page.waitForTimeout(4000);
console.log(await page.evaluate(async ()=>{ __hc.openInv(); await new Promise(r=>setTimeout(r,700));
  const R=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)];};
  const gc=[...document.querySelectorAll('#gridbed .gcell')];
  const pr=[...document.querySelectorAll('#primaries .islot')];
  return { uiz:getComputedStyle(document.documentElement).getPropertyValue('--uiz').trim(),
    gcells:gc.length, gcell0:gc[0]?R(gc[0]):null, gcellCS:gc[0]?getComputedStyle(gc[0]).width:null,
    gridinv:R(document.getElementById('gridinv')), invtop:R(document.getElementById('invtop')),
    prim:pr.map(R), primCls:pr.map(e=>e.className), primCS:pr.map(e=>getComputedStyle(e).width),
    carry:[...document.querySelectorAll('#carrycol .islot')].map(R) }; }));
await b.close(); server.kill();
