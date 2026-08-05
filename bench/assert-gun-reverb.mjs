// A GUNSHOT CARRIES THE PLACE IT WAS FIRED IN (Ben 08-04): open ground gets a late, dull roll-back and almost no room tail;
// a sealed room gets a loud, bright, immediate one. Audio is measured through the graph, because there is nothing to look at.
//   node bench/assert-gun-reverb.mjs
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
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1200);
    await page.evaluate(`(()=>{ const pr=__hc.probe(); __hc.tp(pr.x, pr.gyHere+2, pr.z); })()`); await sleep(700);

    console.log('\n[1] out in the open');
    const open = await page.evaluate(`__hc.gunSpace()`);
    console.log('   ', JSON.stringify(open));
    ok('the room tail is nearly silent with nothing to answer', open.near<0.25, {near:open.near, cov:open.cov});
    ok('the roll-back arrives late, the way distance works', open.farDelay>0.15, {farDelay:open.farDelay});
    ok('and it comes back dull', open.farCut<2000, {farCut:open.farCut});

    console.log('\n[2] sealed in a room');
    await page.evaluate(`(()=>{ const pr=__hc.probe(); const x=Math.round(pr.x), y=Math.round(pr.y), z=Math.round(pr.z);
      // The roof has to clear the eye by more than two blocks: "inside" means a genuine CEILING, not a walled courtyard, and
      // opaqueTop is measured against the eye height.
      for(let dx=-3;dx<=3;dx++) for(let dy=0;dy<=7;dy++) for(let dz=-3;dz<=3;dz++){
        const edge=(Math.abs(dx)===3||Math.abs(dz)===3||dy===0||dy===7);
        __hc.setBlock(dx,dy-1,dz, edge?'stone':null); } })()`);
    await sleep(1400);
    const room = await page.evaluate(`__hc.gunSpace()`);
    console.log('   ', JSON.stringify(room));
    ok('the probe reads boxed-in', room.cov>0.6, {cov:room.cov});
    ok('the room answers loudly', room.near>open.near*2, {open:open.near, room:room.near});
    ok('and it answers at once', room.nearDelay<open.nearDelay+0.001 && room.nearDelay<0.02, {nearDelay:room.nearDelay});
    ok('a room does not roll back off a treeline', room.far<open.far, {open:open.far, room:room.far});
    ok('and its tail keeps its top end', room.nearCut>open.nearCut, {open:open.nearCut, room:room.nearCut});

    console.log('\n[3] a suppressor leaves less to come back');
    const sup = await page.evaluate(`__hc.gunSpace(true)`);
    ok('both tails drop with the report', sup.near<room.near*0.5 && sup.far<=room.far, {near:sup.near, far:sup.far});

    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
