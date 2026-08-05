// A PLACED PROP FACES THE WAY YOU WERE LOOKING (Ben's item 25), for the props where both facings already exist as blocks.
//
// The rocking chair shipped in two facings since the cabin was built — rocking_chair and rocking_chair_w (rotY -PI/2) — but only
// world-gen could reach the turned one: a chair you placed always faced the same way, and the second facing sat in the creative
// menu as a separate prop called "Rocking Chair W". Same complaint Ben made about the cameras.
//
// The four families that already took their facing from the look direction are checked here too, because item 25 is about all of
// them and a regression in any one would be invisible otherwise: stairs, roof, corner, and the CCTV pair.
//
// The REST of item 25 is not here and is blocked: a block with no second id needs a per-position facing side-table plus mesher
// instance rotation plus save/load, and which blocks get that is Ben's call.
//
//   node bench/assert-place-facing.mjs
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
// yaw 0 looks down -Z, yaw PI/2 looks down -X (see lookDir): so these two are "along Z" and "along X".
const ALONG_Z=0, ALONG_X=Math.PI/2;
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
    await page.evaluate(`__hc.qaLocked(true)`);
    const put=(item,yaw)=>page.evaluate(`__hc.placeFacing(${JSON.stringify(item)}, ${yaw})`);

    // ---- THE CHAIR: the new half ----
    const cz=await put('rocking_chair', ALONG_Z), cx=await put('rocking_chair', ALONG_X);
    console.log('    chair along Z', JSON.stringify(cz), '\n    chair along X', JSON.stringify(cx));
    ok('a chair placed looking along Z is the plain chair', cz.block==='rocking_chair', cz);
    ok('a chair placed looking along X is the turned one', cx.block==='rocking_chair_w', cx);
    ok('…and the turned one really carries a rotation', cx.rotY!==0, {rotY:cx.rotY});
    // ITEMS is module scope, so the menu facts come back through the probe rather than a page.evaluate on the map itself.
    ok('the menu offers one chair, not two', cx.turn==='rocking_chair_w' && cx.turnHidden===true, {turn:cx.turn,hidden:cx.turnHidden});

    // ---- THE FOUR FAMILIES THAT ALREADY DID THIS: no regression ----
    const st=[await put('stairs',ALONG_Z), await put('stairs',ALONG_X)];
    console.log('    stairs', JSON.stringify(st.map(r=>r.block)));
    ok('stairs still take their facing from the look', st[0].block!==st[1].block && /^stairs_/.test(st[0].block||'') && /^stairs_/.test(st[1].block||''), st.map(r=>r.block));
    const rf=[await put('roof',ALONG_Z), await put('roof',ALONG_X)];
    console.log('    roof', JSON.stringify(rf.map(r=>r.block)));
    ok('roof still takes its facing from the look', rf[0].block!==rf[1].block && /^roof_/.test(rf[0].block||''), rf.map(r=>r.block));
    // NOT the corner family, and that is a finding rather than an omission: nothing can place one. corner_ne/nw/se/sw exist as
    // blocks, doPlace has an `it.corner` branch for them, and NO item carries corner:true — while their drop names 'stair_corner',
    // an item that does not exist either. What shipped for auto-corners (item 26) is the MESHER branch that quarters a stairs
    // block, so these four ids are vestigial. Flagged for Ben, not fixed here.
    const cam=[await put('camera',ALONG_Z), await put('camera',ALONG_X)];
    console.log('    camera', JSON.stringify(cam.map(r=>r.block)));
    ok('the one camera item still places both axes', cam[0].block!==cam[1].block && /^camera_/.test(cam[0].block||''), cam.map(r=>r.block));
    const mon=[await put('monitor',ALONG_Z), await put('monitor',ALONG_X)];
    console.log('    monitor', JSON.stringify(mon.map(r=>r.block)));
    ok('the one monitor item still places both axes', mon[0].block!==mon[1].block && /^monitor_/.test(mon[0].block||''), mon.map(r=>r.block));

    // ---- A PLAIN CUBE IS UNTOUCHED: it.turn must not leak onto everything ----
    const pl=[await put('planks',ALONG_Z), await put('planks',ALONG_X)];
    ok('a plain block places the same id whichever way you look', pl[0].block==='planks' && pl[1].block==='planks', pl.map(r=>r.block));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
