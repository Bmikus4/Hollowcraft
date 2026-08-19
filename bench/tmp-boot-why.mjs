// SCRATCH. The loader never hides. Print every console line and page error during a boot.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import { chromium } from 'playwright-core';
const ROOT=path.resolve('.');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise(res=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); }); }
function waitHttp(u){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>20000)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(/err|fail|warn|nan|undefined/i.test(t)) console.log('console['+m.type()+']:',t.slice(0,200)); });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    for(let i=0;i<24;i++){
      await sleep(2500);
      const s=await page.evaluate(`(()=>{ try{ return { started:__hc.st().started,
        load:(document.getElementById('load')||{style:{}}).style.display,
        fill:__hc.fill&&__hc.fill() }; }catch(e){ return {e:String(e.message||e)}; } })()`);
      console.log(i, JSON.stringify(s));
      if(s.load==='none') break;
    }
  } finally { await browser.close(); server.kill(); }
})();
