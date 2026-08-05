// Tier 1 verification: furniture + junk piles, windows between rooms, arched doorways.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(7000);
    await page.evaluate(`__hc.qa(60)`);
    const props = await page.evaluate(`window.__hcBR.props()`);
    console.log('props', props.length, JSON.stringify(props.slice(0,8)));
    console.log('windows', JSON.stringify(await page.evaluate(`window.__hcBR.windows()`)));
    console.log('arches', await page.evaluate(`window.__hcBR.arches()`));
    console.log('samples', JSON.stringify(await page.evaluate(`(()=>{ const o={}; for(const k of ['fluor','fluorout','cord','collapse','vending','creak']) o[k]=(window.SFX&&SFX[k])?SFX[k].length:null; return o; })()`)));
    const seen=new Set();
    for(let i=0;i<props.length && seen.size<6;i++){ if(seen.has(props[i].kind))continue; seen.add(props[i].kind);
      await page.evaluate(`window.__hcBR.goProp(${i})`); await sleep(2400);
      await page.screenshot({ path: path.join(OUT,'v1-prop-k'+props[i].kind+'.png'), clip:{x:340,y:150,width:600,height:470} });
      console.log('shot prop kind',props[i].kind);
    }
    console.log('errs', errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
