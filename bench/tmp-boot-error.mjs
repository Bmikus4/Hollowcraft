// Boot the page and print whatever it says. When harnesses start timing out on "started===true", the useful question is not which
// harness — it is what the page threw, and every harness hides that behind a wait.
//   node bench/tmp-boot-error.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:800,height:500}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR: '+String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(/error|fail|cannot|undefined|not a function/i.test(t)) console.log('  CONSOLE: '+t.slice(0,300)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await sleep(9000);
    const st=await page.evaluate('(()=>{ try{ return { hc:!!window.__hc, started:window.__hc?__hc.st().started:null }; }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  state after 9s: '+JSON.stringify(st));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
