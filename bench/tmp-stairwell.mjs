// STAIRWELLS, as a human would see them. Every earlier stair harness measured the ramp SURFACE and the voxel carve and
// passed green over a staircase Ben reports as unwalkable — invisible blocks, the floor cutting through it, no ceiling.
// So this one measures the things those did not: the rendered planes around a flight, the boundary masonry over it, and
// whether an upper-storey chunk's own geometry lands on its own storey at all.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(1500);
    await page.evaluate(`window.__hcBRX.levels(true)`); await sleep(2000);
    await page.evaluate(`__hc.qa(70)`);
    // WITHOUT THIS THE PLAYER DOES NOT MOVE. `locked` gates the update loop, so in a headless run every physics probe
    // returns exactly where it was placed — which reads as a pass for "nothing lifted you" and proves nothing at all.
    await page.evaluate(`__hc.aim(false)`);

    // ---- 1. does an UPPER-storey chunk's own geometry sit on its own storey? ----
    // r.ceil / w.ty are stored LOCAL at generation and rewritten to WORLD by brxUnion; brBuildEnv then builds in local
    // space inside a group that is itself offset by dy. If both apply, an upper chunk's ceiling lands a whole storey high.
    const storeys = await page.evaluate(`window.__hcBRX.storeys()`);
    console.log('per-chunk storey bookkeeping:'); for(const s of storeys) console.log('   ', JSON.stringify(s));
    // the rendered ceiling of a chunk = its group offset + the local height the quad was built at
    const rendered = await page.evaluate(`window.__hcBRX.groupY()`);
    console.log('rendered chunk groups (dy, worldMinY, worldMaxY):'); for(const r of rendered) console.log('   ', JSON.stringify(r));
    // r.ceil / w.ty are SUPPOSED to be world — collision reads them. What must not happen is the storey landing twice,
    // which shows up as a chunk's own geometry rendering above its own ceiling. A vertical room legitimately carries on
    // up three storeys, so those chunks are excluded rather than fudged.
    const upper = storeys.filter(s=>s.lvl>0);
    T('an upper-storey chunk exists in the loaded set to test', upper.length>0, {loaded:storeys.length});
    // A chunk that OWNS a stairwell legitimately builds the well's far lining up to the storey above's ceiling — that is the
    // one thing of its own that reaches over the boundary. Everything else must stay under its own lid.
    const TOP = 40 + 9 + 9;   // BR_FLOOR + (BRX_LEVELS-1)*BR_CH + BR_CH
    const overshot = storeys.filter(s=>!s.tall && s.maxY!=null && s.maxY > (s.wells? TOP : s.wantCeil)+0.6);
    T('no chunk renders its own geometry above its own ceiling', overshot.length===0, overshot.slice(0,4));

    // ---- 1b. does every loaded chunk actually HAVE a floor and a ceiling? ----
    const slab = await page.evaluate(`window.__hcBRX.slabAudit()`);
    console.log('slab audit:', JSON.stringify(slab));
    T('every loaded chunk has a floor under it', slab.cols>0 && slab.noFloor===0, {cols:slab.cols, noFloor:slab.noFloor, sample:slab.sample.slice(0,4)});
    T('every loaded chunk has a ceiling over it', slab.cols>0 && slab.noCeil===0, {cols:slab.cols, noCeil:slab.noCeil, sample:slab.sample.slice(0,4)});

    // ---- 2. the boundary masonry over a stair crossing ----
    // A flight crosses the boundary at HALF a storey up (y45.5 on a 41->50 flight), which is well above the doorway
    // header at BR_DOORH (43.67). A lintel there slices the staircase in two.
    const blocked = await page.evaluate(`window.__hcBRX.wellDiag()`);
    console.log('what sits in each flight\'s boundary opening:'); for(const b of blocked) console.log('   ', JSON.stringify(b));
    T('no lintel header is built across a stairwell opening', blocked.every(b=>b.lintels.length===0), blocked.filter(b=>b.lintels.length).slice(0,3));
    T('no door leaf is hung in a stairwell opening', blocked.every(b=>b.doorsInIt===0), blocked.filter(b=>b.doorsInIt).slice(0,3));

    // ---- 3. the walk surface must not extend past the visible enclosure ----
    const widths = blocked.map(b=>({hw:b.hw, chw:b.chw, rail:b.rail}));
    console.log('flight widths:', JSON.stringify(widths.slice(0,4)));
    T('the walk surface does not reach past the enclosure it sits in', widths.length>0 && widths.every(w=>w.chw <= w.hw+0.01), widths.filter(w=>w.chw>w.hw+0.01).slice(0,3));

    // ---- 4. standing in the room beside a flight must not be lifted by anything invisible ----
    const near = await page.evaluate(`window.__hcBRX.rampNear()`);
    if(near){
      // PROVE PHYSICS IS LIVE FIRST. Dropped 1.2 above a tread, the player must actually land on it — if the update loop is
      // not running, every probe below returns exactly where it was placed and reads as a pass.
      const midSurf=(near.y0+near.y1)/2;
      await page.evaluate(`window.__hcBRX.standOnRampAt(${JSON.stringify(near)},0.5)`);
      let ly=null; for(let k=0;k<24;k++){ await sleep(120); ly=(await page.evaluate(`__hc.pos()`)).y; if(Math.abs(ly-midSurf)<0.02) break; }
      T('physics is live: dropped onto a tread, the player lands on it', Math.abs(ly-midSurf)<0.05, {got:+ly.toFixed(2), tread:midSurf});
    }
    if(near){
      const probes=[];
      const lowT = near.y0<=near.y1? 0.12 : 0.88, base=Math.min(near.y0,near.y1);
      const surfLow = near.y0+(near.y1-near.y0)*lowT, dh=(base+0.2)-surfLow;
      for(const off of [2.0, 2.6, 3.4]){
        // put the player on the LOWER floor beside the foot of the flight and let physics settle
        await page.evaluate(`window.__hcBRX.standBesideRamp(${JSON.stringify(near)},${lowT},${off},${dh})`);
        await sleep(600);
        const y=(await page.evaluate(`__hc.pos()`)).y;
        probes.push({off, want:base, got:+y.toFixed(2), lifted:+(y-base).toFixed(2)});
      }
      console.log('beside the foot of a flight:', JSON.stringify(probes));
      T('nothing invisible lifts you off the floor beside a flight', probes.every(p=>p.lifted<0.6), probes.filter(p=>p.lifted>=0.6));
    } else T('a flight exists to probe', false);

    // ---- 4b. stepping OFF the head of a flight must land you on the storey it joins ----
    // The footprint is carved through the upper storey's floor, and the flight's head sits exactly on the last carved column.
    // Walk one step further and you must be standing on that storey's intact floor — not dropping down the well you just came up.
    if(near){
      const hiY=Math.max(near.y0,near.y1), tHead = near.y1>near.y0 ? 1 : 0;
      const steps=[];
      for(const d of [0, 0.06, 0.2, 0.5, 1.0, 2.0]){
        const t = tHead===1 ? 1+d/16 : -d/16;                                   // d blocks past the head, along the flight axis
        await page.evaluate(`window.__hcBRX.standOnRampAt(${JSON.stringify(near)},${t})`);
        // WAIT FOR REST, do not guess a settle time — a fixed sleep reads the player mid-drop, which looks exactly like
        // being held up by something that is not there.
        let y=null, prev=null, still=0;
        for(let k=0;k<24;k++){ await sleep(120); y=(await page.evaluate(`__hc.pos()`)).y;
          if(prev!==null && Math.abs(y-prev)<0.01){ if(++still>=3) break; } else still=0; prev=y; }
        steps.push({past:d, y:+y.toFixed(2), want:hiY, drop:+(hiY-y).toFixed(2)});
      }
      console.log('stepping off the head:', JSON.stringify(steps));
      T('stepping off the head of a flight lands on the upper storey, not back down the well',
        steps.every(s=>s.drop<1.2), steps.filter(s=>s.drop>=1.2));
    }

    // ---- 5. from the upper storey, is there a floor over the flight, and a ceiling over the well? ----
    const roof = near ? await page.evaluate(`window.__hcBRX.headroom(${JSON.stringify(near)})`) : null;
    console.log('headroom along a flight (voxel):', JSON.stringify(roof));
    T('every point on a flight has a roof over it', !!roof && roof.every(p=>p.head!==null), (roof||[]).filter(p=>p.head===null));
    T('every point on a flight has standing headroom', !!roof && roof.every(p=>p.head===null || p.head>=1.9), (roof||[]).filter(p=>p.head!==null&&p.head<1.9));

    T('zero page errors', errs.length===0, errs.slice(0,4));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('\n'+fails+' FAILING') : '\nALL PASS');
  process.exit(fails?1:0);
})();
