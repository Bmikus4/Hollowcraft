// Measured heights of every model block, so hitboxes can be set from the art.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:800,height:600}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await sleep(3000);
    const rows = await page.evaluate(`__hc.modelBounds()`);
    if(rows.err){ console.log('ERR', rows.err); return; }
    console.log('name'.padEnd(18)+'model'.padEnd(14)+'solid'.padStart(6)+'half'.padStart(6)+'minY'.padStart(8)+'maxY'.padStart(8)+'height'.padStart(8)+'width'.padStart(8));
    for(const r of rows){ if(r.err){ console.log(r.name.padEnd(18)+r.model.padEnd(14)+'  ERR '+r.err.slice(0,50)); continue; }
      console.log(r.name.padEnd(18)+String(r.model).padEnd(14)+String(r.solid).padStart(6)+String(r.half).padStart(6)+String(r.minY).padStart(8)+String(r.maxY).padStart(8)+String(r.height).padStart(8)+String(r.width).padStart(8)); }
    fs.writeFileSync(path.join(ROOT,'bench','results','model-bounds.json'), JSON.stringify(rows,null,2));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
