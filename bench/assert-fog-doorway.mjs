// STANDING IN A DOORWAY DOES NOT TURN THE FOG OFF, AND NEITHER DOES A CANOPY — BUT A ROOM STILL DOES.
//
// Ben, 08-05: "fog dissapears when inside of a doorway", then the general rule he worked out himself, "when we are underneath a
// block fog dissapears", and his guess that it is also why "lighting breaks at certain angles".
//
// THE MECHANISM: the weather fog was gated on playerRoofed(), a BOOLEAN that scans the single column from ry+2 to ry+9 for an
// opaque block. A door lintel is one opaque cell at ry+2, so stepping into a doorway read as indoors and the entire bank — fog
// density, fog colour, the shell's opacity and the viewmodel haze — switched off in one frame. That one-frame switch is the
// "certain angles". My earlier `_under` theory was tested under the CATHEDRAL roof and correctly measured nothing, because that
// roof is above ry+9: the gate is distance-limited, and a doorway is exactly the case that trips it.
//
// THE FIX has two halves and this file asserts them separately:
//   a 5x5 FOOTPRINT of columns instead of one, so a doorway roofs one of nine and a room roofs nine of nine; and
//   occludesSky instead of isOpaque, so leaves_core — opaque for RENDERING, transparent to skylight since Ben 07-23 — stops
//   counting as a roof. Under the old mask a dense canopy turned the fog off in a wood.
//
// THE DISCRIMINATING ASSERTION is the pair: in the doorway the OLD test (roofedBool) must still say true while the delivered fog
// is untouched. If roofedBool were false there, this harness would be standing somewhere else and proving nothing.
//
//   node bench/assert-fog-doorway.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function frame(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p10:+v[(v.length*0.1)|0].toFixed(2), p90:+v[(v.length*0.9)|0].toFixed(2),
           spread:+(v[(v.length*0.9)|0]-v[(v.length*0.1)|0]).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);
    // pinScene() SETS weather.fog TO ZERO, along with rain, cloud and overcast — so the bank has to be forced back on AFTER it or
    // every reading below is of clear air. Same trap as pinScene zeroing cloud cover.
    await page.evaluate(`__hc.fog(0.85)`);
    const S=await page.evaluate(`__hc.st()`);
    const X=Math.round(S.sx)+8, Z=Math.round(S.sz);
    const gy=await page.evaluate(`__hc.groundY(${X},${Z})`);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.42); __hc.fog(0.85);`); await sleep(420); await page.evaluate(`__hc.setTime(0.42)`); await sleep(200); };
    // settle the eased enclosure at whatever the current position is: 4/s, so half a second is most of the way and a second is all
    const settle=async()=>{ await sleep(1100); };
    const read=async()=>page.evaluate(`__hc.fogEncl()`);
    const shot=async tag=>{ const f=path.join(OUT,`fogdoor-${tag}.png`); await page.screenshot({path:f}); return f; };
    const VIEW=[0.20,0.80,0.30,0.62];

    // ---- 1. OPEN GROUND, the reference ------------------------------------------------------------------------------------
    // LOOK OUT THROUGH THE OPENING, not along the wall. The wall this harness builds runs along z at x=X, so yaw 0 (lookDir
    // 0,0,-1) puts planks a block from the lens and the frame check would be measuring a plank, not the air beyond it.
    // yaw -1.5708 is lookDir (+1,0,0) — straight out of the doorway. Set here too so the open reference is the SAME view.
    await page.evaluate(`__hc.tpAt(${X}+0.5, ${gy}+2.0, ${Z}+0.5); __hc.cam({yaw:-1.5708, pitch:-0.05});`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await settle(); await pin();
    const open=await read(); const openF=frame(await shot('open'),VIEW);
    console.log(`  open ground   ${JSON.stringify(open)}`);
    console.log(`  open frame    ${JSON.stringify(openF)}`);
    check('the bank is on and the fog is full in the open', open.weatherFog>0.8 && open.wf>0.8 && open.kill<0.02, JSON.stringify(open));
    check('and the old boolean agrees there is no roof here', open.roofedBool===false, `roofedBool ${open.roofedBool}`);

    // ---- 2. A DOORWAY — Ben's own repro ----------------------------------------------------------------------------------
    // A wall either side of a one-block gap, with a lintel over it. THE GAP IS THREE HIGH and the player stands with their feet on
    // the ground: the first version put a 2-high gap under a lintel at gy+3 and teleported to gy+2, so the player's head was
    // inside the lintel and the collision resolver shoved them out of the doorway along its own opening — every reading was taken
    // in the open, roofedBool came back false, and the harness would have "passed" the fog check while standing outside the repro.
    // (Plan §7, paid for again: check the vantage is what you think. A buried test once had the player pushed out of the rock.)
    await page.evaluate(`(()=>{
      for(const dz of [-2,-1,1,2]) for(let y=${gy}+1;y<=${gy}+5;y++) __hc.cmdRun('/setblock ${X} '+y+' '+(${Z}+dz)+' planks');
      for(let y=${gy}+4;y<=${gy}+5;y++) __hc.cmdRun('/setblock ${X} '+y+' ${Z} planks');
    })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(900);
    const lintel=await page.evaluate(`({ over:__hc.blockAt(${X},${gy}+4,${Z}), gap:__hc.blockAt(${X},${gy}+2,${Z}), wall:__hc.blockAt(${X},${gy}+2,${Z}+1) })`);
    check('the doorway is built (lintel over an open gap in a wall)', lintel.over>0 && lintel.gap===0 && lintel.wall>0, JSON.stringify(lintel));
    await page.evaluate(`__hc.tpAt(${X}+0.5, ${gy}+1, ${Z}+0.5); __hc.cam({yaw:-1.5708, pitch:-0.05});`); await sleep(700);
    // WHERE IS THE PLAYER, actually. Asserted rather than assumed, because being shoved out of the doorway is exactly how this
    // check passes for the wrong reason.
    const pos=await page.evaluate(`__hc.pos()`);
    console.log(`  standing at   ${JSON.stringify(pos)}  (doorway column ${X+0.5}, ${Z+0.5})`);
    check('the player is IN the doorway, not shoved out of it', Math.abs(pos.x-(X+0.5))<0.6 && Math.abs(pos.z-(Z+0.5))<0.6,
      `at ${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}`);
    await settle(); await pin();
    const door=await read();
    console.log(`  in a doorway  ${JSON.stringify(door)}`);
    // THE PAIR THAT IS THE WHOLE FIX: the old test still calls this indoors, and the fog does not care.
    check('the OLD boolean still calls a doorway "roofed" (so we are standing in Ben\'s repro)', door.roofedBool===true, `roofedBool ${door.roofedBool}`);
    check('the fog survives a doorway', door.kill<0.05 && door.wf>open.wf*0.95, `kill ${door.kill}, wf ${open.wf} -> ${door.wf}`);
    // AND IT IS THERE IN PIXELS — measured as fog ON against fog OFF at THIS vantage, not against the open-ground frame. Comparing
    // two different vantages compares two different sets of geometry: the doorway's own jambs are in frame and moved the median 33
    // levels on their own, which says nothing about fog. With the bank toggled and nothing else changed, the difference IS the fog.
    const donF=frame(await shot('doorway-fog'),VIEW);
    await page.evaluate(`__hc.fog(0)`); await sleep(700); await page.evaluate(`__hc.setTime(0.42)`); await sleep(300);
    const doffF=frame(await shot('doorway-clear'),VIEW);
    await pin(); await sleep(300);
    console.log(`  doorway, fog on  ${JSON.stringify(donF)}`);
    console.log(`  doorway, fog off ${JSON.stringify(doffF)}`);
    check('the doorway frame is visibly fogged', Math.abs(donF.med-doffF.med)>8 || Math.abs(donF.spread-doffF.spread)>8,
      `median ${doffF.med} -> ${donF.med}, spread ${doffF.spread} -> ${donF.spread}`);

    // ---- 3. A CANOPY IS NOT A ROOF --------------------------------------------------------------------------------------
    // leaves_core is `cat:'solid'` and therefore isOpaque, which is why the old mask killed the fog in a wood. It is excluded from
    // occludesSky (Ben 07-23), so the new gate must ignore it — and the old boolean must still say true, or this proves nothing.
    // Away from the doorway so the two cases cannot be confused, and the canopy is at gy+6 — clear of the head and inside the
    // ry+2..ry+9 window the old boolean scans.
    const LX=Math.round(S.sx)-14, LZ=Math.round(S.sz);
    const LY=await page.evaluate(`__hc.groundY(${LX},${LZ})`);
    await page.evaluate(`(()=>{ for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) __hc.cmdRun('/setblock '+(${LX}+dx)+' '+(${LY}+6)+' '+(${LZ}+dz)+' leaves_core'); })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tpAt(${LX}+0.5, ${LY}+1, ${LZ}+0.5)`); await sleep(700);
    const lpos=await page.evaluate(`__hc.pos()`);
    check('the player is under the canopy', Math.abs(lpos.x-(LX+0.5))<0.6 && Math.abs(lpos.z-(LZ+0.5))<0.6,
      `at ${lpos.x.toFixed(2)},${lpos.y.toFixed(2)},${lpos.z.toFixed(2)}`);
    await settle(); await pin();
    const leaf=await read();
    console.log(`  under leaves  ${JSON.stringify(leaf)}`);
    check('a leaf canopy is not a roof for fog', leaf.kill<0.05 && leaf.wf>open.wf*0.95, `kill ${leaf.kill}, wf ${leaf.wf}`);
    check('and the old boolean does call the canopy a roof', leaf.roofedBool===true, `roofedBool ${leaf.roofedBool}`);

    // ---- 4. A ROOM STILL HAS NO FOG -------------------------------------------------------------------------------------
    // The deliberate behaviour, and it predates all of this: indoors the lantern and the room have to stay readable in fog.
    const RX=Math.round(S.sx)+26, RZ=Math.round(S.sz), RY=await page.evaluate(`__hc.groundY(${Math.round(S.sx)+26},${Math.round(S.sz)})`);
    await page.evaluate(`(()=>{
      for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++){ __hc.cmdRun('/setblock '+(${RX}+dx)+' '+(${RY}+4)+' '+(${RZ}+dz)+' planks');
        __hc.cmdRun('/setblock '+(${RX}+dx)+' '+(${RY})+' '+(${RZ}+dz)+' planks'); }
      for(let dx=-3;dx<=3;dx++) for(let y=${RY}+1;y<=${RY}+3;y++){ __hc.cmdRun('/setblock '+(${RX}+dx)+' '+y+' '+(${RZ}-3)+' planks'); __hc.cmdRun('/setblock '+(${RX}+dx)+' '+y+' '+(${RZ}+3)+' planks'); }
      for(let dz=-3;dz<=3;dz++) for(let y=${RY}+1;y<=${RY}+3;y++){ __hc.cmdRun('/setblock '+(${RX}-3)+' '+y+' '+(${RZ}+dz)+' planks'); __hc.cmdRun('/setblock '+(${RX}+3)+' '+y+' '+(${RZ}+dz)+' planks'); }
    })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tpAt(${RX}+0.5, ${RY}+1.2, ${RZ}+0.5)`); await sleep(500);
    // THE EASE, read before it settles: one frame after arriving the eased value must NOT already be at the raw one, or the fog is
    // still snapping and Ben's "lighting breaks at certain angles" is untouched.
    await sleep(90); const mid=await read();
    await settle(); await pin();
    const room=await read();
    console.log(`  room, 90ms in ${JSON.stringify(mid)}`);
    console.log(`  room, settled ${JSON.stringify(room)}`);
    check('a sealed room reads fully enclosed', room.raw>0.95 && room.kill>0.95 && room.wf<0.03, JSON.stringify(room));
    check('and getting there is EASED, not a one-frame switch', mid.eased < room.eased-0.05 && mid.raw>0.95,
      `raw ${mid.raw}, eased ${mid.eased} -> ${room.eased}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/fogdoor-*.png   (__hc.fogEncl() is the gate itself)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
