// Stairwell flights: does a flight get built, and can the player actually walk up it?
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const BR_CH_EXPECT=9, BR_LEVELS_MAX=1;   // BRX_LEVELS=2 → top storey index 1
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(2500);
    await page.evaluate(`__hc.qa(70)`);

    // levels OFF → no flights (a flight between two chunks on the same storey would be a step to nowhere)
    const off = await page.evaluate(`window.__hcBRX.levels(false)`);
    T('with levels OFF no flights are built', off.ramps===0, off);
    // levels ON → flights appear, one per stair crossing in the loaded set
    const on = await page.evaluate(`window.__hcBRX.levels(true)`); await sleep(1200);
    T('with levels ON flights are built at the stair crossings', on.ramps>0, on);
    console.log('ramps', JSON.stringify((await page.evaluate(`window.__hcBRX.ramps()`)).slice(0,4)));

    // Sample a REAL flight, not a synthetic one. Only genuine stair crossings get their ceiling slab opened (brStairAt),
    // so a forced flight beside the player is roofed and cannot be climbed past the ceiling line — an earlier pass here
    // was incidental, not evidence.
    const st = await page.evaluate(`window.__hcBRX.forceStair(9)`); await sleep(900);
    T('a forced flight reports a foot, a head and steps', !!st && st.steps>=4, st);
    await page.evaluate(`__hc.aim(false)`);
    // move onto a real flight, let the stream settle, then RE-FIND it (a boundary crossing reorders BR.ramps)
    await page.evaluate(`window.__hcBRX.standOnRamp(0,0.05)`); await sleep(2500);
    const near = await page.evaluate(`window.__hcBRX.rampNear()`);
    console.log('nearest real flight', JSON.stringify(near));
    // a flight may DESCEND, so compare the magnitude of the storey change, not a signed climb
    T('a real flight is reachable and spans one storey', !!near && Math.abs(Math.abs(near.y1-near.y0)-BR_CH_EXPECT)<0.6, near);
    if(near){
      const got=[];
      for(const t of [0,0.25,0.5,0.75,1.0]){
        const w=await page.evaluate(`window.__hcBRX.standOnRampAt(${JSON.stringify(near)},${t})`);
        // WAIT FOR REST, do not guess a settle time. A fixed sleep made this sample alternate between pass and fail on the
        // same seed: read too early and the player is still mid-drop onto the tread, which looks exactly like an obstruction.
        let y=null, prev=null, still=0;
        for(let k=0;k<20;k++){ await sleep(120); y=(await page.evaluate(`__hc.pos()`)).y;
          if(prev!==null && Math.abs(y-prev)<0.005) { if(++still>=2) break; } else still=0;
          prev=y; }
        got.push({t, want:w?w.want:null, got:+y.toFixed(2), err:w?+Math.abs(y-w.want).toFixed(2):null});
      }
      console.log('real flight surface:', JSON.stringify(got));
      { const dxr=near.x1-near.x0, dzr=near.z1-near.z0;
        const qx=near.x0+dxr*0.25, qz=near.z0+dzr*0.25;
        console.log('flights claiming t=0.25:', JSON.stringify(await page.evaluate(`window.__hcBRX.rampsAt(${qx},${qz})`))); }
      T('the flight surface is exact end to end', got.every(g=>g.err!==null && g.err<0.6), got.filter(g=>g.err===null||g.err>=0.6));
      const span=got[4].got-got[0].got;
      T('walking it changes storey by exactly one', Math.abs(Math.abs(span)-BR_CH_EXPECT)<0.6, {foot:got[0].got, head:got[4].got, span:+span.toFixed(2)});
      const maxY = 40 + BR_LEVELS_MAX*9 + 1;
      T('no flight reaches beyond the top storey', got.every(g=>g.want===null || g.want<=maxY+0.01), {maxY, beyond:got.filter(g=>g.want>maxY)});
      // BALUSTRADE: the side walls are render-only meshes, so this asserts the COLLISION added in the ramp loop, not the
      // geometry. Stand mid-flight and strafe hard into each side: you must stay on the treads, not step off into the well.
      for(const key of ['KeyA','KeyD']){
        await page.evaluate(`window.__hcBRX.standOnRampAt(${JSON.stringify(near)},0.5)`); await sleep(500);
        await page.keyboard.down(key); for(let i=0;i<6;i++) await sleep(300); await page.keyboard.up(key); await sleep(400);
        const q=await page.evaluate(`__hc.pos()`);
        const dxr=near.x1-near.x0, dzr=near.z1-near.z0, ll=dxr*dxr+dzr*dzr||1;
        const tt=Math.max(0,Math.min(1,((q.x-near.x0)*dxr+(q.z-near.z0)*dzr)/ll));
        const offd=Math.hypot(q.x-(near.x0+dxr*tt), q.z-(near.z0+dzr*tt));
        const surf=near.y0+(near.y1-near.y0)*tt;
        T('strafing '+key+' does not push the player off the flight', offd<1.6 && Math.abs(q.y-surf)<1.0,
          {off:+offd.toFixed(2), hw:1.1, y:+q.y.toFixed(2), surf:+surf.toFixed(2)});
      }
      // ...and press the branch directly: the walls are render-only meshes, so this tests the COLLISION in the ramp loop.
      const NEAR=JSON.stringify(near);
      // t=0.25, NOT 0.5: the crossing sits ON the chunk boundary, so offsetting sideways at t=0.5 lands inside the
      // boundary wall beside the opening and it is the WALL push-out being measured, not the balustrade.
      await page.evaluate(`window.__hcBRX.standBesideRamp(${NEAR},0.25,1.3,0.1)`); await sleep(500);
      const inside=await page.evaluate(`window.__hcBRX.rampOffset(${NEAR})`);
      T('level with the treads, just outside the rail, you are pulled back onto the flight', inside.off<=1.1,
        Object.assign({hw:1.1}, inside));
      T('...and still standing on the tread, not dropped', Math.abs(inside.y-inside.surf)<1.0, inside);
      // THE SHAFT ITSELF, asserted on the voxels rather than on where a dropped player happens to land. The earlier
      // version placed the player at off 2.2 and checked it was not snapped onto the flight — but that column turned out to
      // be uncarved concrete, so it was asserting a push-out from inside solid rock and proved nothing about the flight.
      const scan = async(off)=>page.evaluate(`window.__hcBRX.colScan(${NEAR},0.25,${off})`);
      const onIt=await scan(0), beside=await scan(1.3), past=await scan(3.0);
      const clear=(c,lo,hi)=>{ for(let y=lo;y<=hi;y++) if(c.solid.includes(y)) return y; return null; };
      T('the stairwell shaft is open through the storey the flight descends past',
        clear(onIt,onIt.span.lo+1,onIt.span.hi)===null && clear(beside,onIt.span.lo+1,onIt.span.hi)===null,
        {onFlight:onIt.solid, beside:beside.solid, span:onIt.span});
      T('the bottom of the shaft is FLUSH with the storey it joins, not a block below it',
        onIt.solid.length>0 && Math.max(...onIt.solid)===onIt.span.lo, {solid:onIt.solid, lo:onIt.span.lo, footOfFlight:Math.min(near.y0,near.y1)});
      // The carve is quantized to whole columns and always overshoots the rails, so the guarantee is not "no slot" but
      // "nothing to fall through": every carved column beside the flight has the stair surface under it.
      for(const o of [1.8, 2.2]){
        const cv=await scan(o);
        if(!cv.solid.includes(onIt.span.hi)){                                    // this column IS carved — so it must be caught
          await page.evaluate(`window.__hcBRX.standBesideRamp(${NEAR},0.25,${o},0.4)`); await sleep(500);
          const q=await page.evaluate(`window.__hcBRX.rampOffset(${NEAR})`);
          // The property that matters is "you do not fall a storey", not "you land exactly on the tread": at the outer edge
          // of the carve the player's 0.42 radius overlaps the intact concrete next door, so being held at floor level there
          // is just as safe as standing on the stair.
          T('a carved column at off '+o+' beside the flight never drops you below the flight',
            q.y >= q.surf-1.0, Object.assign({carved:cv.solid.length}, q));
        } else T('off '+o+' is outside the carve — intact floor', true, {solid:cv.solid.length});
      }
      T('past the shaft the floor slab is intact — the carve is the flight footprint, not a trench',
        past.span===null && past.solid.includes(onIt.span.hi), {solid:past.solid, span:past.span});
      await page.screenshot({ path: path.join(OUT,'v1-stairs-top.png') });
    }
    const fps=[]; for(let i=0;i<4;i++){ await sleep(700); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    console.log('fps', JSON.stringify(fps), 'stats', JSON.stringify(await page.evaluate(`window.__hcBRX.stats()`)));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
