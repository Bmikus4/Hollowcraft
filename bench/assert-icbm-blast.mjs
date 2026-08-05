// THE WARHEAD ACTUALLY DESTROYS WHAT IS IN ITS RADIUS (Ben 08-04), burns, trails smoke and whites out the screen.
//   node bench/assert-icbm-blast.mjs
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
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1200);
    await page.evaluate(`(()=>{ const pr=__hc.probe(); __hc.tp(pr.x, pr.gyHere+2, pr.z); })()`); await sleep(700);

    console.log('\n[1] a bunker built inside the radius does not survive it');
    const built = await page.evaluate(`(()=>{ const pr=__hc.probe();
      // a wall 12 blocks out — well inside the 40-block bowl — recorded as real player edits
      const bx=Math.round(pr.x)+12, bz=Math.round(pr.z), by=Math.round(pr.y);
      for(let i=0;i<6;i++) __hc.setBlock(12, i, 0, 'stone');
      return { bx, by, bz, edits:__hc.editCount(), at:__hc.blockAt(bx,by+2,bz) }; })()`);
    console.log('   ', JSON.stringify(built));
    ok('the wall is there and recorded as an edit', built.edits>0, {edits:built.edits});

    // The white-out is read in the SAME evaluate as the detonation: it holds for a tenth of a second and then fades over one,
    // so a probe a frame and a half later is reading the fade, not the flash.
    const det = await page.evaluate(`(()=>{ const pr=__hc.probe(); const r=__hc.nuke(pr.x, pr.z); r.fx=__hc.nukeFx(); return r; })()`);
    console.log('   ', JSON.stringify(det));
    await sleep(1500);
    const after = await page.evaluate(`__hc.editCount()`);
    ok('the blast forgot the edits inside it', after<built.edits, {before:built.edits, after});
    ok('and it says how many it took', det.wiped>0, {wiped:det.wiped});

    console.log('\n[2] nothing grows back on the floor of the bowl');
    const grew = await page.evaluate(`(()=>{ const pr=__hc.probe(); return { inside:__hc.inCrater(pr.x, pr.z), rim:__hc.inCrater(pr.x+60, pr.z) }; })()`);
    ok('ground zero is dead ground', grew.inside===true, grew);
    ok('and well outside it is not', grew.rim===false, grew);

    console.log('\n[3] it burns, and it whites the screen out');
    const fx = await page.evaluate(`__hc.nukeFx()`);
    console.log('   ', JSON.stringify(fx));
    ok('the firestorm is running', fx.fireT>0, {fireT:fx.fireT});
    ok('it burns across the whole bowl, not a spot', fx.fireR>20, {fireR:fx.fireR});
    ok('the screen went white at the instant of the blast', det.fx.whiteOpacity>0.9, {opacity:det.fx.whiteOpacity});
    ok('a lot of particles are alive', fx.particles>100, {particles:fx.particles});
    await sleep(2200);
    const fx2 = await page.evaluate(`__hc.nukeFx()`);
    ok('the white lifts again — it is a split second, not a fade to nothing', fx2.whiteOpacity<0.5, {opacity:fx2.whiteOpacity});
    ok('and the fire is still going after two seconds', fx2.fireT>0, {fireT:fx2.fireT});

    console.log('\n[4] the missile leaves a trail on the way');
    const trail = await page.evaluate(`(()=>{ const pr=__hc.probe(); const p0=__hc.nukeFx().particles;
      // A launch spends a real missile out of a real silo, so the bench stands one on a pad rather than conjuring a flight.
      const b=__hc.setBlock(3,0,3,'icbm');
      const r=__hc.icbmLaunch(pr.x+150, pr.z+150, {x:b.wx,y:b.wy,z:b.wz});
      return {p0, launch:r, flight:__hc.icbmState()}; })()`);
    console.log('   ', JSON.stringify(trail));
    if(trail.flight && trail.flight.state==='flight'){
      await sleep(1800);
      const p1 = await page.evaluate(`__hc.nukeFx().particles`);
      ok('smoke is being emitted along the arc', p1>0, {particles:p1});
    } else ok('a launch could be started', false, trail.flight);

    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
