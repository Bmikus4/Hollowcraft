// DROPPED STACKABLE ITEMS MERGE (Ben's backlog item 30: "dropped stackable items merge when close together").
//
// Mining a seam or emptying a chest leaves a heap of separate entities on one block, each with its own mesh, bob and pickup — and the
// drop list is capped at 200, so a big heap silently shifts older drops out of the world. What is measured is the ENTITY COUNT and the
// conservation of the total: eight drops of 4 coal must become one entity of 32, not eight bobbing coals and not 31.
//
// Two things this bench must not get wrong. spawnDrop pops each item out on a RANDOM impulse, so nothing can be counted until they are
// at rest. And the pickup magnet vacuums anything within 1.6 blocks of the player once its delay expires — every drop here is spawned
// with a 999 s delay so the heap survives long enough to be measured.
//
//   node bench/assert-drop-merge.mjs
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
    await page.mouse.click(450,300); await sleep(1500);

    // ---- A HEAP OF ONE THING, all inside a block of each other ----
    for(let k=0;k<8;k++) await page.evaluate(`__hc.dropAt('coal',4,${(k%3)*0.3-0.3},${((k/3)|0)*0.3-0.3},999)`);
    let r=await page.evaluate(`__hc.dropsHere('coal')`);
    console.log('    just spawned', JSON.stringify({entities:r.entities, total:r.total, resting:r.resting}));
    ok('eight separate coal drops exist to start with', r.entities>=8 && r.total===32, {entities:r.entities, total:r.total});
    await sleep(4000);
    r=await page.evaluate(`__hc.dropsHere('coal')`);
    console.log('    after landing', JSON.stringify({entities:r.entities, total:r.total, max:r.max, rows:r.rows}));
    ok('they merge into one entity', r.entities===1, {entities:r.entities});
    ok('...and nothing is lost or invented', r.total===32, {total:r.total, expected:32});

    // ---- THE STACK LIMIT IS RESPECTED: 96 coal cannot be one pile ----
    for(let k=0;k<24;k++) await page.evaluate(`__hc.dropAt('coal',4,0.2,0.2,999)`);
    await sleep(4500);
    r=await page.evaluate(`__hc.dropsHere('coal')`);
    console.log('    over a stack', JSON.stringify({entities:r.entities, total:r.total, max:r.max, rows:r.rows}));
    ok('a pile never exceeds the item\'s own stack limit', r.rows.every(x=>x.n<=r.max), {max:r.max, rows:r.rows});
    ok('...and the total still adds up', r.total===128, {total:r.total, expected:128});

    // ---- A BRANDED ITEM NEVER MERGES. A uid is an instance — two rifles are two rifles. ----
    // HONEST ABOUT WHAT THIS PROVES: a rifle's own stack limit is 1, so the size cap already forbids the merge and the uid rule is
    // belt and braces here. Only a gun the PLAYER dropped carries a uid, and a harness cannot mint one.
    const g1=await page.evaluate(`(()=>{ __hc.giveItem('ar15',1); return __hc.dropsHere('ar15').entities; })()`);
    for(let k=0;k<3;k++) await page.evaluate(`__hc.dropAt('ar15',1,0.1,0.1,999)`);
    await sleep(4000);
    const rg=await page.evaluate(`__hc.dropsHere('ar15')`);
    console.log('    guns', JSON.stringify({entities:rg.entities, total:rg.total, rows:rg.rows}));
    ok('three dropped rifles are still three rifles', rg.total===3, {entities:rg.entities, total:rg.total});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
