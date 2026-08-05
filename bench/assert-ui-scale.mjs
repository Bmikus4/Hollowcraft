// THE MENUS SCALE WITH THE SCREEN (Ben's backlog item 35: "inventory and pause menu bigger on high-resolution screens").
//
// Every panel is authored in fixed px against a 1280x720 window, so on 1440p the inventory is a postage stamp. --uiz is the smaller of
// the two axis ratios against that reference, floored at 1 and capped at 1.9.
//
// A CSS variable being set is not a panel being bigger, so this measures the inventory panel's real on-screen box at three window sizes
// and requires it to GROW — and it checks the same panel at 1280x720 is unchanged, because a fix that scales the reference size too has
// only moved the problem.
//
//   node bench/assert-ui-scale.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await sleep(1200);
    const read=async(w,h)=>{ await page.setViewportSize({width:w,height:h}); await sleep(500); return await page.evaluate(`__hc.uiScale()`); };
    const ref=await read(1280,720);
    console.log('    1280x720', JSON.stringify(ref));
    ok('the reference window is unscaled', ref.uiz===1, {uiz:ref.uiz});
    ok('...and the panel is measurable', ref.panel && ref.panel.w>100, ref.panel);
    const hd=await read(1920,1080);
    console.log('    1920x1080', JSON.stringify(hd));
    ok('1080p scales the menus up', hd.uiz>1.4, {uiz:hd.uiz});
    ok('...and the panel is really bigger on screen', hd.panel.w > ref.panel.w*1.3, {was:ref.panel, now:hd.panel});
    const qhd=await read(2560,1440);
    console.log('    2560x1440', JSON.stringify(qhd));
    ok('1440p is capped, not unbounded', qhd.uiz>1.8 && qhd.uiz<=1.9, {uiz:qhd.uiz});
    ok('...and the panel still fits the window', qhd.panel.h*qhd.uiz < 1440, {panelH:qhd.panel.h, uiz:qhd.uiz});
    const small=await read(1024,600);
    console.log('    1024x600', JSON.stringify(small));
    ok('a small window never SHRINKS a panel', small.uiz===1, {uiz:small.uiz});
    ok('the zoom reaches the panel itself', hd.zoomOnPanel && hd.zoomOnPanel!=='1' && hd.zoomOnPanel!=='normal', {zoomOnPanel:hd.zoomOnPanel});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
