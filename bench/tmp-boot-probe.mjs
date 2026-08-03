// Does the game boot? Prints every page error, failed request and console error, then whether `started` ever flips.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page=await (await browser.newContext({viewport:{width:1024,height:640}})).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR: '+String(e.stack||e.message||e).slice(0,900)));
    page.on('requestfailed', r=>console.log('REQFAILED: '+r.url().replace(base,'')+'  '+(r.failure()&&r.failure().errorText)));
    page.on('response', r=>{ if(r.status()>=400) console.log('HTTP '+r.status()+': '+r.url().replace(base,'')); });
    page.on('console', m=>{ if(m.type()==='error'||/error|fail|cannot|undefined/i.test(m.text())) console.log('CONSOLE['+m.type()+']: '+m.text().slice(0,500)); });
    await page.goto(base+'/index.html', { waitUntil:'load', timeout:90000 });
    await sleep(4000);
    const st=await page.evaluate(`(()=>{ try{ return { hasHc:!!window.__hc, st:window.__hc?__hc.st():null,
      load:(document.getElementById('load')||{style:{}}).style.display, err:(document.getElementById('err')||{}).textContent||null }; }catch(e){ return {evalErr:String(e.message||e)}; } })()`);
    console.log('BOOT STATE: '+JSON.stringify(st));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
