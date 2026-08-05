// NO DUNGEON SYMBOL HANGS OVER AN OPENING (Ben's backlog item 32: "don't place dungeon symbols over open doorways").
//
// The placement gate probed ONE block, behind the middle of the glyph's plane. That is correct for the small glyphs and useless for the
// big ones: `big` runs to 4.2 blocks across, so a glyph seated on solid wall a metre from a passage mouth hung half of itself over the
// opening. The gate now walks the glyph's whole footprint.
//
// Measured off the BUILT geometry, not off the placement code: the glyphs are welded into one merged mesh per material and the merge
// bakes their world matrices in, so every vertex is a real world position and the wall block behind it can be sampled. A vertex whose
// backing block is not mossy is a corner of a symbol floating over a passage.
//
//   node bench/assert-dungeon-glyphs.mjs
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
    // The lair is generated with the world but decorated when it streams — dunGo needs it to exist, so wait for the lair, then stand in it.
    let go=null;
    for(let i=0;i<40;i++){ go=await page.evaluate(`__hc.dunGo(2)`); if(!go.err) break; await sleep(1200); }
    console.log('    dunGo', JSON.stringify(go));
    ok('the dungeon exists and can be stood in', go && !go.err, go);
    if(!go || go.err) throw new Error('no lair');
    let r=null;
    for(let i=0;i<25;i++){ r=await page.evaluate(`__hc.dungeonGlyphs()`); if(r && r.glyphVerts>0) break; await sleep(1200); }
    console.log('    glyphs', JSON.stringify({glyphVerts:r.glyphVerts, overOpening:r.overOpening, no:r.no, sample:r.sample}));
    ok('the hall has symbols scratched on its walls', r.glyphVerts>100, {glyphVerts:r.glyphVerts, no:r.no});
    ok('and NONE of them hangs over an opening', r.overOpening===0, {overOpening:r.overOpening, of:r.glyphVerts, sample:r.sample});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
