// A WATCH TOWER STANDS ON FOUR LEGS (Ben 08-05: "watch towers, not the big mountain ones, are missing some of their log posts, or at
// least part of their log posts").
//
// The four posts were built from gy — surfaceH at the tower's CENTRE — so on a slope the downhill corners began in mid-air. A count of
// log blocks cannot catch that on its own: a post can be ten blocks long and still start three blocks up. What matters is whether there
// is AIR under its foot, which is what a leg with its bottom missing is. The readiness gate also only checked the four post columns'
// chunks while the builder writes out to ±4, so a tower on a chunk boundary dropped whatever fell outside.
//
//   node bench/assert-tower-posts.mjs
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
    // Each tower has to be visited: the builder waits for its own chunks, and the probe refuses to measure a tower whose chunks are
    // not loaded rather than reporting an unbuilt one as a broken one.
    let r=null;
    const spots=await page.evaluate(`__hc.towerPosts().towers.map(t=>t.at)`);
    for(const [x,z] of spots){ await page.evaluate(`__hc.tpExact(${x},${z})`); await sleep(3500); }
    await page.evaluate(`__hc.tpExact(${spots[0][0]},${spots[0][1]})`); await sleep(2500);
    r=await page.evaluate(`__hc.towerPosts()`);
    for(const t of r.towers) console.log('    tower', JSON.stringify(t));
    ok('at least one tower is built and measurable', r.builtTowers>=1, {builtTowers:r.builtTowers, of:r.towers.length});
    ok('no post is missing entirely', r.postsMissing===0, {postsMissing:r.postsMissing});
    // THE REAL ASSERTION. A post whose foot hangs over air is the reported fault, and it is the one a block count cannot see.
    ok('no post hangs in the air', r.postsFloating===0, {postsFloating:r.postsFloating});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
