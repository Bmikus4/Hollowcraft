// Why did __hc.hw(11) not put a Horrific Wretch in the world? Reports what the hook returns, what the
// roster says immediately after, and again two seconds later — a creature that spawns and is culled on its
// first tick looks identical to one that never spawned, from the outside.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    page.on('console',m=>{ const t=m.text(); if(/horrific|wretch|drift/i.test(t)) console.log('console:',t.slice(0,180)); });
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    const pr = await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.tp(${pr.spawnX}, ${pr.spawnZ}); __hc.setTime(0.85); __hc.look(0.7,0); __hc.lock(true); })()`);
    await sleep(5000);
    console.log('before:', JSON.stringify(await page.evaluate(`({ pos:__hc.pos(), hw:__hc.hwState(), st:__hc.st() })`)).slice(0,300));
    for(const d of [11, 9, 6, 14]){
      const r = await page.evaluate(`(()=>{ try{ const a=__hc.hw(${d}); return { call:a, roster:__hc.hwState() }; }catch(e){ return {err:String(e.message||e)}; } })()`);
      await sleep(2500);
      const after = await page.evaluate(`({ roster:__hc.hwState(), probe:(__hc.hwProbe?__hc.hwProbe():null) })`);
      console.log(`\nhw(${d}) ->`, JSON.stringify(r).slice(0,400));
      console.log(`  2.5 s later ->`, JSON.stringify(after).slice(0,400));
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
