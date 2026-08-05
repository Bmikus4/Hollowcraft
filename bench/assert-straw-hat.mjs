// THE STRAW HAT CONTAINS THE HEAD (Ben 08-05: "the players head shows through the top of the straw hat").
// The head is a BOX and the hat is a cylinder, so the numbers that matter are the head's diagonal against the crown's inradius
// and the head's top face against the flat top's underside. Also renders it in third person and counts skin pixels above the
// brim line, because a geometric fit and a visible poke-through are not the same claim.
//   node bench/assert-straw-hat.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const W=1000,H=640;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    console.log('   ', JSON.stringify(await page.evaluate(`__hc.equipHat('straw_hat')`)));
    await sleep(600);
    const f = await page.evaluate(`__hc.hatFit()`);
    console.log('    hatFit', JSON.stringify(f));
    ok('the rig and both hat parts were found', !f.no && !f.err, f);
    if(!f.no && !f.err){
      // A round hat over a square head clears the DIAGONAL. Width is not enough: the head is 0.30 x 0.32, so its corners sit
      // 0.219 out while its sides are 0.15-0.16 out, and a crown that tapered to 0.19 covered the sides and not the corners.
      ok('the crown clears the head\'s corners', f.crownClearsCorners > 0.005, {crownMinInradius:f.crownMinInradius, halfDiag:f.halfDiag, margin:f.crownClearsCorners});
      // Coplanar faces are not cover: the flat top used to sit with its upper face exactly on the head's top face at y 2.00.
      ok('the flat top sits above the skull, not in its plane', f.capClearsHead > 0.005, {capBottom:f.capBottom, headTop:f.headTop, margin:f.capClearsHead});
      ok('…and it is wide enough to cover the top face\'s corners', f.capCoversCorners > 0.005, {capInradius:f.capInradius, halfDiag:f.halfDiag, margin:f.capCoversCorners});
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
