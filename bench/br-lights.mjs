// DO THE LIGHTS APPEAR — in the scene graph, and on the screen.
//
// Ben, from playing it: "lights didnt appear (tested in game)". `litNear` counts entries in a light array and is
// therefore not admissible: it is the bookkeeping that said the halls were fine while he was standing in the dark.
// Two questions, both about what the player sees:
//   FIXTURES — for every fixture record near the player, does a MESH exist at its coordinates (the tube you look at);
//   LIGHT    — how many THREE.Light objects are actually in the scene graph with intensity above zero and how near
//              they are, and then the only measurement that cannot be argued with: render a frame and read the
//              PIXELS back out of the GL context, in the room the camera is standing in.
// Pixel luminance is read straight after an explicit renderer.render on the same tick, so no preserveDrawingBuffer is
// needed and nothing is screenshotted.
//
// usage: node bench/br-lights.mjs      (HC_ROOT=<pinned tree>)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const REPO='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);

const PROBE = `
window.__LT={
  // Every light actually in the graph, by type, with the nearest few to the player. A pool entry parked at the origin
  // with intensity 0 is not a light in the room, and this is where that shows.
  lights(){ const rows=[], v=new THREE.Vector3(); let on=0;
    scene.traverse(o=>{ if(!o.isLight) return; o.getWorldPosition(v);
      const d=Math.hypot(v.x-player.pos.x, v.z-player.pos.z), dy=v.y-player.pos.y;
      if(o.intensity>0) on++;
      rows.push({ t:o.type, i:+(o.intensity||0).toFixed(2), d:+d.toFixed(1), dy:+dy.toFixed(1),
                  dist:o.distance!=null?+o.distance.toFixed(1):null, vis:o.visible }); });
    rows.sort((a,b)=>a.d-b.d);
    return { total:rows.length, lit:on, within20m:rows.filter(r=>r.d<20&&r.i>0).length, nearest:rows.slice(0,8) }; },
  // DOES THE TUBE EXIST. Fixture records near the player against meshes found at their coordinates — the fitting you
  // look up at, which is a different question from whether it casts light.
  fixtures(R){ const rad=R||24, F=(BR.fixtures||[]), v=new THREE.Vector3();
    let near=0, withMesh=0, dead=0; const miss=[];
    const meshes=[]; if(BR.env) BR.env.traverse(o=>{ if(o.isMesh) meshes.push(o); });
    const centres=meshes.map(m=>{ const b=new THREE.Box3().setFromObject(m); const c=new THREE.Vector3(); b.getCenter(c); return c; });
    for(const f of F){ const d=Math.hypot(f.x-player.pos.x, f.z-player.pos.z); if(d>rad) continue; near++;
      if(f.dead) dead++;
      let hit=false; for(const c of centres){ if(Math.hypot(c.x-f.x, c.z-f.z)<1.2){ hit=true; break; } }
      if(hit) withMesh++; else if(miss.length<8) miss.push({x:+f.x.toFixed(1), z:+f.z.toFixed(1), dead:!!f.dead}); }
    return { fixturesWithin:near, withMeshAtCoords:withMesh, deadFixtures:dead, envMeshes:meshes.length, missing:miss }; },
  // THE ONLY UNARGUABLE ONE: render a frame and read the pixels. Mean/median luminance and the share of the frame that
  // is essentially black. A lit hall and an unlit hall are not close on this number.
  pixels(){
    renderer.render(scene, camera);
    const gl=renderer.getContext(), w=Math.min(320, gl.drawingBufferWidth), h=Math.min(180, gl.drawingBufferHeight);
    const buf=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const L=[]; let sum=0, black=0;
    for(let i=0;i<w*h;i++){ const l=0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2]; L.push(l); sum+=l; if(l<8) black++; }
    L.sort((a,b)=>a-b);
    return { w, h, mean:+(sum/L.length).toFixed(1), median:+L[L.length>>1].toFixed(1),
             p90:+L[Math.floor(L.length*0.9)].toFixed(1), blackPct:+(100*black/L.length).toFixed(1) }; },
  // WHAT DOES THE POOL ACTUALLY CONTRIBUTE. Ben: "LIGHTS ARE NOT WORKING, I CANNOT SEE THEM ... I can see FAINT
  // flickering, but thats it". My earlier claim rested on the frame no longer being BLACK (1.9 -> 43.8), which is not the
  // same statement as the ceiling lights lighting the room. So turn the pool off and read the frame again: the difference
  // IS the pool's contribution, and if it is small then 43.8 was ambient and emissive, not tube light.
  contrib(){ const on=this.pixels();
    const keep=(BR.lightPool||[]).map(L=>({L, i:L.intensity, v:L.visible}));
    brPoolLightsOff(); const off=this.pixels();
    for(const k of keep){ k.L.intensity=k.i; k.L.visible=k.v; }
    const back=this.pixels();
    return { withPool:on.mean, poolOff:off.mean, restored:back.mean, contribution:+(on.mean-off.mean).toFixed(1),
             pctFromPool: on.mean>0? +(100*(on.mean-off.mean)/on.mean).toFixed(1):null }; },
  // THE TWO GATES IN brxUpdateLights, counted. A fixture is skipped entirely if brLitRooms does not contain its room, and
  // its intensity is multiplied by brFlick when it is a flicker — a mostly-off duty cycle reads exactly as faint flicker.
  gate(){ let vis=null; try{ vis=brLitRooms(); }catch(e){}
    const F=BR.fixtures||[]; let near=0, dead=0, gatedOut=0, flick=0, roomNull=0;
    for(const f of F){ const d=Math.hypot(f.x-player.pos.x, f.z-player.pos.z); if(d>95) continue; near++;
      if(f.dead){ dead++; continue; }
      if(f.room==null) roomNull++;
      if(vis && f.room!=null && !vis.has(f.room)) gatedOut++;
      if(f.flick) flick++; }
    return { fixturesWithin95m:near, dead, gatedOutByLitRooms:gatedOut, litRoomsSize:vis?vis.size:null,
             flickering:flick, roomNull, poolSlots:(BR.lightPool||[]).length, brLightPool:PERF.brLightPool }; },
  // THE DUTY CYCLE, over frames rather than at one instant. A single sample cannot tell a lit hall from a strobing one.
  duty(n){ const N=n||60, rows=[];
    for(let k=0;k<N;k++){ let lit=0, sum=0;
      for(const L of (BR.lightPool||[])){ if(L.visible && L.intensity>0){ lit++; sum+=L.intensity; } }
      rows.push({lit, sum:+sum.toFixed(1)}); brxUpdateLights(player.pos.x, player.pos.z); }
    const litAvg=rows.reduce((a,r)=>a+r.lit,0)/rows.length, sumAvg=rows.reduce((a,r)=>a+r.sum,0)/rows.length;
    return { frames:rows.length, avgLitSlots:+litAvg.toFixed(2), avgTotalIntensity:+sumAvg.toFixed(1),
             minLit:Math.min(...rows.map(r=>r.lit)), maxLit:Math.max(...rows.map(r=>r.lit)) }; },
  // IS EVERY FIXTURE'S LIGHT INSIDE THE ROOM IT LIGHTS. f.y is read in WORLD space by brxUpdateLights; the room carries
  // its own world floor (fy) and ceiling. A fixture below its room's floor is a light under the floorboards.
  heights(){ const F=BR.fixtures||[]; let n=0, below=0, above=0, noY=0; const bad=[];
    const bases=[...new Set((BR.loaded||[]).map(r=>brxLevelDy(r.gx,r.gz)))].sort((a,b)=>a-b);
    for(const f of F){ n++; if(f.y==null){ noY++; continue; }
      const r=brxRoomAt(f.x,f.z); if(!r) continue;
      const floor=(r.fy!=null?r.fy:BR_WY0), ceil=(r.ceil!=null?r.ceil:BR_WY1);
      if(f.y<floor){ below++; if(bad.length<6) bad.push({at:[+f.x.toFixed(0),+f.z.toFixed(0)], y:+f.y.toFixed(1), floor:+floor.toFixed(1), ceil:+ceil.toFixed(1)}); }
      else if(f.y>ceil+0.5) above++; }
    return { fixtures:n, belowTheirRoomFloor:below, aboveTheirCeiling:above, noY, storeyOffsetsLoaded:bases, worst:bad }; },
  // Stand under the nearest live fixture and look up, so the pixel read is of a place that is SUPPOSED to be lit rather
  // than wherever the camera happened to be pointing.
  standUnderFixture(){ let best=null;
    for(const f of (BR.fixtures||[])){ if(f.dead) continue;
      const d=Math.hypot(f.x-player.pos.x, f.z-player.pos.z); if(!best||d<best.d) best={f,d}; }
    if(!best) return {err:'no live fixture'};
    player.pos.x=best.f.x; player.pos.z=best.f.z; player.pitch=-0.6; player.yaw=0;
    camera.position.copy(player.pos); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    return { at:[+best.f.x.toFixed(1), +best.f.z.toFixed(1)], wasM:+best.d.toFixed(1) }; }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__LT=')) return 'already patched';
  if(path.resolve(root).toLowerCase()===path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT');
  const a='PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if(!s.includes(a)) throw new Error('probe anchor missing');
  fs.writeFileSync(f, s.replace(a, a+PROBE));
  return 'patched';
}

(async()=>{
  console.log('probe: '+ensureProbe(ROOT));
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    const ev=async(js)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,200)}; } };

    // A SINGLE-FRAME LUMINANCE CANNOT BE COMPARED ACROSS TWO ARMS. 27 fixtures in range flicker, brFlick toggles a burst
    // about 6.5 times a second, and `pixels()` reads ONE frame — so its mean carries whatever phase those tubes were in.
    // Compared across arms that reads as a real difference: hop-depth arms once reported 47.8 / 44.7 / 44.7 on one tree and
    // 47.8 / 40.2 / 47.8 on another, i.e. 2 hops darker than both 1 and 3, which is not monotonic and so is not the gate.
    // Sampling has to cross REAL TIME, not a tight loop: brFlick is driven off performance.now(), and repeated renders
    // inside one page.evaluate all land in the same millisecond and therefore the same phase.
    // `contrib()` is exempt and stays as it is — its three reads happen in ONE synchronous block with the pool toggled
    // between them, so brxUpdateLights cannot re-run and the phase is held constant. That is a same-tick A/B and sound.
    const pixelsOverTime=async(n=24, gapMs=70)=>{
      const ms=[]; for(let i=0;i<n;i++){ const p=await ev('__LT.pixels()'); if(p&&typeof p.mean==='number') ms.push(p.mean); await sleep(gapMs); }
      if(!ms.length) return {err:'no samples'};
      const mean=ms.reduce((a,b)=>a+b,0)/ms.length;
      const sd=Math.sqrt(ms.reduce((a,b)=>a+(b-mean)*(b-mean),0)/ms.length);
      return { n:ms.length, spanMs:n*gapMs, mean:+mean.toFixed(2), min:+Math.min(...ms).toFixed(1),
               max:+Math.max(...ms).toFixed(1), swing:+(Math.max(...ms)-Math.min(...ms)).toFixed(1), sd:+sd.toFixed(2) }; };

    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hcPERF.arm()');
    // The overworld frame in daylight is the control the halls have to be compared against: it fixes what this
    // renderer's "lit" looks like on this machine, so a dark hall is a difference and not an absolute.
    console.log('OVERWORLD pixels: '+J(await ev('__LT.pixels()')));

    console.log('enter:    '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    for(const sd of [1234567,31337,4242]){
      await ev('__hcBR.seed('+sd+')'); await sleep(1200);
      const lv=await ev('(()=>{const s=[...new Set((BR.loaded||[]).map(r=>brxLevelDy(r.gx,r.gz)))];return s.sort((a,b)=>a-b);})()');
      console.log('seed '+sd+' storey offsets: '+J(lv));
      if(Array.isArray(lv) && lv.length>1) break; }
    console.log('lights:   '+J(await ev('__LT.lights()')));
    console.log('fixtures: '+J(await ev('__LT.fixtures(24)')));
    console.log('pixels:   '+J(await ev('__LT.pixels()'))+'   <- ONE FRAME, phase-dependent, do not compare arms on this');
    console.log('pixelsAvg: '+J(await pixelsOverTime())+'   <- compare arms on THIS');
    console.log('heights:  '+J(await ev('__LT.heights()')));
    console.log('gate:     '+J(await ev('__LT.gate()')));
    console.log('duty:     '+J(await ev('__LT.duty(60)')));
    console.log('contrib:  '+J(await ev('__LT.contrib()')));
    console.log('under:    '+J(await ev('__LT.standUnderFixture()')));
    await sleep(500);
    console.log('pixels under fixture: '+J(await ev('__LT.pixels()')));
    console.log('pixelsAvg under fixture: '+J(await pixelsOverTime()));
    console.log('lights here: '+J(await ev('__LT.lights()')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
