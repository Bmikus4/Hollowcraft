// THE HUNTING RIFLE'S SCOPE IS LIVE IN THE HAND, AND ZOOMS FURTHER (Ben 08-05: "make the scope on the hunting rifle always visible when
// the item is held, not just on ADS. also allow the scope to be zoomed in further").
//
// uActive is the uniform the lens shader mixes its dark-optic colour away with, so it is exactly "is this glass showing the world". It
// used to follow adsT, which is 0 at the hip — a flat dark disc — and the magnified scene pass was skipped below 0.22 to save the cost.
// It is throttled to every third frame at the hip instead of skipped, so the picture is live at 20 Hz in a 2 cm circle.
//
// The zoom floor was 4 degrees of FOV (17.5x) in one-degree steps; it is 1.4 (about 50x) in constant 14% ratios. A floor that is never
// reached is not a floor, so the bench turns the wheel far past it and requires it to stop there.
//
//   node bench/assert-scope-always-on.mjs
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
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    const hip=await page.evaluate(`__hc.scopeState('hunting_rifle',false)`);
    console.log('    at the hip', JSON.stringify(hip));
    ok('the scoped rifle is held and not aimed', hip.id && hip.adsT<0.2, {id:hip.id, adsT:hip.adsT, err:hip.err});
    ok('...and its glass is showing the world anyway', hip.uActive>=1, {uActive:hip.uActive});
    const aim=await page.evaluate(`__hc.scopeState('hunting_rifle',true)`);
    console.log('    aimed', JSON.stringify(aim));
    ok('aiming keeps it on', aim.uActive>=1 && aim.adsT>0.8, {uActive:aim.uActive, adsT:aim.adsT});
    // A crafted XPS replaces the scope entirely: that variant has no magnified pass and must stay dark.
    const dot=await page.evaluate(`__hc.scopeState('hunting_rifle_dot',false)`);
    console.log('    the XPS variant', JSON.stringify(dot));
    ok('the holosight variant has no scope glass', dot.uActive===0, {uActive:dot.uActive});
    // ZOOM: in past the floor, then out past the ceiling.
    const inn=await page.evaluate(`__hc.scopeZoom(-40)`);
    console.log('    wheel in x40', JSON.stringify(inn));
    ok('it zooms far past the old 17.5x limit', inn.zoomX>30, {zoomX:inn.zoomX, fov:inn.scopeFov});
    ok('...and stops at its floor rather than inverting', inn.scopeFov>=1.39, {fov:inn.scopeFov});
    const out=await page.evaluate(`__hc.scopeZoom(40)`);
    console.log('    wheel out x40', JSON.stringify(out));
    ok('the wide end is unchanged', Math.abs(out.scopeFov-16)<0.01, {fov:out.scopeFov, zoomX:out.zoomX});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
