// THE BLOCK UNDER THE WORSHIP-RUIN CANDELABRA IS A FULL CUBE, NOT A SLAB (Ben 08-04).
//
// The candelabra is placed at gy+2 and its model is drawn from its own cell's floor, so on a half-height altar its base stood
// in air with a gap under it, and the two candles flanking it sit on the ground at gy+1 — which read as the altar being sunk
// into the floor rather than a step up to the thing holding the light.
//
// Proved with __hc.hits() rather than by reading a block id, because the claim is about HEIGHT: aabbHits lets you stand on a
// short block (`if(_h<1){ if(y < yy+_h) ... }`), so a probe at the cell's upper half collides for a cube and passes straight
// through for a slab. That distinguishes the two whatever block was chosen.
//
//   node bench/assert-shrine-altar.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.42); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // THE RUIN BUILDS ITSELF once its site is chunk-loaded, so fly there and wait for the spawner to publish the spot rather
    // than assuming the offsets from the source.
    const S=await page.evaluate(`__hc.st()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+90, 80, ${S.sz}-40)`);
    for(let i=0;i<40;i++){ const m=await page.evaluate(`__hc.monks()`); if(m && m.shrine) break; await sleep(600); }
    const shrine=(await page.evaluate(`__hc.monks()`)).shrine;
    if(!shrine){ check('the worship ruin exists', false, 'no shrine spot published after 24s'); console.log(`\n${checks-fails}/${checks} checks pass`); process.exit(1); }
    const gy=await page.evaluate(`__hc.groundY(${shrine.x},${shrine.z})`);
    const ax=shrine.x, az=shrine.z-3, ay=gy+1;    // the altar cell: buildShrine puts it 3 north of the site, candelabra at +2
    console.log(`  ruin at (${shrine.x}, ${shrine.z}), altar cell (${ax}, ${ay}, ${az}), candelabra at y=${ay+1}`);
    await page.evaluate(`__hc.tpAt(${ax}+0.5, ${ay}+6, ${az}+0.5)`); await sleep(1200);

    // The two probes that separate a cube from a slab. Both are taken at the altar's own cell, at the player's centre.
    const lower=await page.evaluate(`__hc.hits(${ax}+0.5, ${ay}+0.10, ${az}+0.5)`);
    const upper=await page.evaluate(`__hc.hits(${ax}+0.5, ${ay}+0.70, ${az}+0.5)`);
    const feet =await page.evaluate(`(()=>{ __hc.tpAt(${ax}+0.5, ${ay}, ${az}+0.5); return __hc.probe().feet; })()`);
    console.log(`  hits at the cell's lower half ${lower}, upper half ${upper}, block id in the cell ${feet}`);
    check('the altar cell is occupied',            lower===true, `hits() low in the cell = ${lower}`);
    check('and it is a FULL block, not a slab',    upper===true, `hits() at 0.70 up the cell = ${upper} — a slab passes through here, a cube does not`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
