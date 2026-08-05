// Does index.html boot at all, and if not, what does it say? Every harness in this repo waits on __hc.st().started, so when the
// shared file is mid-edit they all report the same useless timeout. This prints the page's own errors instead.
//   node bench/tmp-boot-check.mjs            HC_PAGE=_headtest.html node bench/tmp-boot-check.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
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
    const page=await browser.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(/error|Error|fail|undefined is not|Cannot/.test(t)) console.log('  console:',t.slice(0,240)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    for(let i=0;i<24;i++){
      const st=await page.evaluate(`(()=>{ try{ return { hc:!!window.__hc, started:(window.__hc?__hc.st().started:null),
        load:(document.getElementById('load')?document.getElementById('load').style.display:'?'),
        loadTxt:(document.getElementById('load')?String(document.getElementById('load').textContent||'').slice(0,80):null) }; }catch(e){ return {err:String(e.message||e)}; } })()`);
      console.log(`  t+${i*5}s ${JSON.stringify(st)}`);
      if(st && st.started===true && st.load==='none') break;
      await sleep(5000);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
