// EVERY ITEM IS HELD IN A HAND (Ben's backlog item 19: "every item must be held in a hand; the monk's cross was the warning").
// The fist is buildFist, whose far -z tip is the palm, and the held item is a separate group on the camera — so nothing made the two
// meet. Swept over the whole item table: 223 of 304 held items sat more than 6 cm off the palm, the worst 23 cm out, floating in front
// of a fist holding air. A model that declares userData.gripAt keeps that precision; everything else is gripped by its own bounding
// box. This walks EVERY id, because "every" is the ask and a spot check of five is what let the monk's cross ship floating.
//   node bench/assert-held-in-hand.mjs
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
    const r=await page.evaluate(`__hc.heldSweep()`);
    fs.writeFileSync(path.join(ROOT,'bench','results','held-sweep.json'), JSON.stringify(r,null,1));
    console.log('    swept', JSON.stringify({total:r.total, held:r.held, noArm:(r.noArm||[]).length, offPalm:r.offPalm, bad:r.bad}));
    console.log('    worst', JSON.stringify((r.worst||[]).slice(0,6)));
    ok('the whole item table was swept', r.total>250 && r.held===r.total, {total:r.total, held:r.held});
    // An arm under every item. A gun carries its own hand parented to the weapon, so the camera-mounted arm stands down for those.
    ok('every held item has an arm under it', (r.noArm||[]).length===0, r.noArm);
    // 6 cm: the palm is a point and the fist is a 0.09 box, so under half its width is a hand closed on the thing.
    ok('and no item is left floating off the palm', r.offPalm===0, {offPalm:r.offPalm, worst:(r.worst||[])[0]});
    ok('…which is the same statement as nothing being wrong', r.bad===0, {bad:r.bad});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
