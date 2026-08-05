// THE TENT IS A TENT (Ben's backlog item 27: "redo the tent: modelled properly, placeable on the ground, sleepable").
//
// What was there was two canvas planes leaning against each other and a vertical pole through the middle of them — an X of cloth from any
// angle but dead-on, with the pole inside the tent where a ridge pole is not, and the panels' bottom edge 12 cm below the block so it
// looked sunk into the ground. It is seven instanced parts now: two pitched panels, four A-frame legs, a ridge beam, a rear wall and a
// bedroll on the floor.
//
// Measured off the BUILT chunk, not off the builder, and the sleep hook is read at runtime rather than from the source.
//
//   node bench/assert-tent.mjs
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
    const page=await (await b.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(500,320); await sleep(1500);
    const put=await page.evaluate(`__hc.setBlock(0,0,-4,'tent')`);
    console.log('placed', JSON.stringify(put));
    let parts=null;
    for(let i=0;i<25;i++){ await sleep(400); const p=await page.evaluate(`__hc.campfireParts(0,0,-4)`); if(p&&p.parts&&p.parts.length){ parts=p.parts; break; } }
    console.log('    parts', parts&&parts.length, JSON.stringify((parts||[]).map(x=>({t:x.type,y:x.yBase,c:x.color}))));
    ok('the tent is built from real parts, not two planes', parts && parts.length>=7, {parts:parts&&parts.length});
    // A RIDGE, not a pole through the middle: the highest part must be the beam at the apex, and it must be a pole colour.
    const top=(parts||[]).reduce((a,b2)=>(b2.yBase>((a&&a.yBase)||-9)?b2:a), null);
    ok('the highest part is the ridge beam', top && top.yBase>0.8 && top.type==='CylinderGeometry', top);
    // A BEDROLL ON THE FLOOR is what makes it read as somewhere to sleep, and it is also the lowest part.
    const low=(parts||[]).reduce((a,b2)=>(b2.yBase<((a&&a.yBase)||9)?b2:a), null);
    ok('there is a bedroll flat on the cell floor', low && low.yBase<0.1 && low.type==='BoxGeometry', low);
    ok('nothing hangs below the block', (parts||[]).every(x=>x.yBase>=0), (parts||[]).map(x=>x.yBase));
    const bu=await page.evaluate(`__hc.blockUse('tent')`);
    console.log('    use hook', JSON.stringify(bu));
    ok('the tent is sleepable', bu && bu.use==='sleep', bu);
    ok('...and it is still a solid block you can place on the ground', bu && bu.solid===true, bu);
    await page.evaluate(`(()=>{ const p=__hc.pos(); return __hc.aimAt(p.x, p.y+0.4, p.z-4); })()`);
    await sleep(1500);
    await page.screenshot({ path: path.join(ROOT,'bench','results','tent.png'), clip:{x:300,y:180,width:420,height:380} });
    console.log('    shot bench/results/tent.png');
    await b.close();
  } finally { server.kill(); }
  console.log(`
${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
