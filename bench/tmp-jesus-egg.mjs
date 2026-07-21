import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--mute-audio']});
    const page=await (await browser.newContext()).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await sleep(1500);
    console.log('intro jesus present:', JSON.stringify(await page.evaluate(`__hc.jesusGhost()`)));
    // spawn a ghost right where the player is (intro jesus greets near spawn)
    await page.evaluate(`__hc.ghostHere(false)`);
    for(let i=0;i<8;i++){ await sleep(1000); const s=await page.evaluate(`__hc.jesusGhost()`); console.log(i, JSON.stringify(s)); }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
