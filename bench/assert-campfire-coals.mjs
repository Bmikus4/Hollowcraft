// A CAMPFIRE HAS COALS IN IT, AND NO UNLIT ORANGE DOME (Ben 08-05: "campfires base should have hot coals in it" / "campfires fire
// has a little blip"). The base was one flattened MeshBasic sphere of saturated orange, 0.6 across, between the logs — unlit, so it
// ignored the scene at every hour and read as a flat blob under the flame. Reads the drawn scene: every instanced mesh whose
// instances sit inside the campfire's own block, with its material and the height it reaches.
//   node bench/assert-campfire-coals.mjs
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
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); })()`); await sleep(700);
    await page.evaluate(`__hc.setBlock(0,-1,-2,'campfire')`);
    // The edit queues a remesh behind however many chunks are streaming; wait for the parts rather than for a timer.
    let r=null;
    for(let i=0;i<40;i++){ await sleep(400); r=await page.evaluate(`__hc.campfireParts(0,-1,-2)`); if(r&&r.parts&&r.parts.length) break; }
    console.log('    campfire parts', JSON.stringify(r));
    ok('the campfire is built', r && r.parts && r.parts.length>=3, r&&{parts:r.parts&&r.parts.length, block:r.block});
    const parts=(r&&r.parts)||[];
    const logs=parts.filter(p=>p.type==='CylinderGeometry');
    const logTop=logs.length?Math.max(...logs.map(p=>p.top)):null;
    // COALS: dark rock that glows. Not a colour choice — an unlit material cannot be a coal, because it ignores the fire's own light.
    // '#000000', with the hash — comparing against '000000' let the two LOGS through as coals, and they are lit wood.
    const coals=parts.filter(p=>!p.basic && p.emissive && p.emissive!=='#000000');
    ok('there are glowing coals in the base', coals.length>=1, coals);
    ok('…and they are dark rock, not orange plastic', coals.every(c=>parseInt(c.color.slice(1),16) < 0x333333), coals.map(c=>c.color));
    ok('…and they sit below the logs', logTop!=null && coals.every(c=>c.top<=logTop), {coalTops:coals.map(c=>c.top), logTop});
    // THE BLIP: the only unlit part left has to be the dim heat bed, low and small — not a 0.6-wide dome.
    const unlit=parts.filter(p=>p.basic);
    console.log('    unlit parts', JSON.stringify(unlit));
    ok('the unlit orange dome is gone', unlit.every(u=>u.top<=0.075), unlit.map(u=>({top:u.top,color:u.color})));
    ok('…and what is left of it is dim', unlit.every(u=>{ const v=parseInt(u.color.slice(1),16); return ((v>>16)&255)<=0xd0; }), unlit.map(u=>u.color));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
