// DO THE DOORS OPEN, AS THE PLAYER — geometry, not bookkeeping.
//
// Ben tested in game: "doors werent openeing ... i couldnt walk through some open doorways". Three harness probes said
// the doors were healthy and one (`doorFrames built:0`) said they were not. The three that lied all measured STATE:
// `useDoor`'s return value, `d.closed` flipping, door records counted. None of them touch the mesh the player looks at.
//
// So this asserts through the player path only:
//   1. stand in front of the door and RAYCAST FROM THE CAMERA CENTRE — literally what the crosshair does;
//   2. remember the mesh the ray HIT, and its WORLD quaternion;
//   3. call brTryToggleDoor(), the same function right-click calls, then run the swing to completion;
//   4. assert THAT MESH's world quaternion changed.
// A door whose state flag flips while the mesh the ray hit never rotates is Ben's symptom, reported as a pass by every
// state-based probe in the suite.
//
// Then the collision half, because "the door reports open" is not "the player fits through": step the physics body
// along the door's normal through the opening using the game's own brxCollide, and assert it arrives on the far side.
//
// brTryToggleDoor() SKIPS any door with no pivots (`if(!d.pivots||!d.pivots.length)continue`) and returns false, so a
// pivot-less door is not a door that fails to open — it is a door the game cannot see. That distinction is the point of
// the `toggled` vs `moved` split below.
//
// usage: node bench/br-player-doors.mjs      (HC_ROOT=<pinned tree>)
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

// scene, camera, BR, brTryToggleDoor and brxCollide are all module-scoped, and __hcBR exposes only state summaries.
// The probe therefore has to be installed INSIDE the module. It refuses to touch the repo checkout: three sessions
// share D:\code\Minecraft and a stray edit there gets swept into another session's whole-file `git add`.
const PROBE = `
window.__PD={
  // Computed here rather than through __hcBR.doorRig, which does not exist on every tree this has to run against.
  // A pivot with no parent, or with no meshes under it, is a door that can never open again.
  rig(){ let doors=0,pivots=0,orphaned=0,empty=0;
    for(const d of (BR.doors||[])){ doors++;
      for(const L of (d.pivots||[])){ pivots++;
        if(!L.pivot || !L.pivot.parent) orphaned++;
        else { let n=0; L.pivot.traverse(o=>{ if(o.isMesh) n++; }); if(!n) empty++; } } }
    return { doors, pivots, orphaned, empty }; },
  // WHERE THE DOOR ACTUALLY IS, taken from the graph and not from the record. d.cx/d.cz are the numbers the state-based
  // probes trusted; if they disagree with the pivot's world position then standing on them is standing nowhere, which is
  // its own finding. Both are reported so the disagreement is visible instead of inferred.
  list(){ return (BR.doors||[]).map((d,i)=>{ const L=(d.pivots||[])[0]; let w=null;
    if(L&&L.pivot){ const v=new THREE.Vector3(); L.pivot.getWorldPosition(v);
      w=[+v.x.toFixed(1),+v.y.toFixed(1),+v.z.toFixed(1)]; }
    return { i, rec:[+(d.cx||0).toFixed(1),+(d.cz||0).toFixed(1)], world:w,
             piv:(d.pivots||[]).length, closed:!!d.closed, a:+(d.a||0).toFixed(2) }; }); },
  // WHY THE PIVOTS ARE MISSING. d.pivots is filled only while brBuildEnv runs, and brBuildEnvAll RE-PARENTS a cached
  // group instead of rebuilding it — so if the door RECORDS were regenerated after the group was cached, BR.doors holds
  // fresh records with no pivots while the meshes belong to the previous generation. This checks object identity between
  // the generator cache and the unioned list, and then forces a real rebuild: if pivots come back, that is the cause.
  why(){
    const out={ loaded:(BR.loaded||[]).length, envCache:BR.envCache?BR.envCache.size:0, gen:BR.gen?BR.gen.size:0 };
    const inUnion=new Set(BR.doors||[]);
    let recDoors=0, sameObject=0, cachedGroup=0;
    for(const rec of (BR.loaded||[])){
      const ck=rec.gx+'_'+rec.gz;
      if(BR.envCache && BR.envCache.has(ck)) cachedGroup++;
      for(const d of (rec.doors||[])){ recDoors++; if(inUnion.has(d)) sameObject++; }
      // is the record the generator would hand out TODAY the same object the union is holding?
      const g=BR.gen&&BR.gen.get(ck);
      if(g && g.doors && g.doors.length && rec.doors && rec.doors.length)
        out.genIsRec = (out.genIsRec===false)? false : (g.doors[0]===rec.doors[0]);
    }
    out.recDoors=recDoors; out.doorsSharedWithUnion=sameObject; out.chunksServedFromCache=cachedGroup;
    out.pivotsBefore=this.rig().pivots;
    try{ brEnvCacheClear(); brxStream(true); out.forcedRebuild=true; }catch(e){ out.rebuildErr=String(e&&e.message||e); }
    out.pivotsAfterForcedRebuild=this.rig().pivots;
    out.doorsAfter=(BR.doors||[]).length;
    return out; },
  test(i){
    const d=(BR.doors||[])[i]; if(!d) return {err:'no door '+i};
    const out={ i, pivots:(d.pivots||[]).length, hit:false, toggled:false, moved:false };
    // STAND WHERE THE GEOMETRY IS. The leaf's own world position, so a record whose coordinates are stale or in the
    // wrong space cannot send the camera into empty void and report "no door here".
    const L0=(d.pivots||[])[0]; if(!L0||!L0.pivot) return Object.assign(out,{ why:'no pivot to locate — door is not in the graph' });
    const W=new THREE.Vector3(); L0.pivot.getWorldPosition(W);
    const Y=W.y+1.4, TX=W.x, TZ=W.z;
    out.world=[+W.x.toFixed(1),+W.y.toFixed(1),+W.z.toFixed(1)];
    out.recOff=+Math.hypot((d.cx||0)-W.x, (d.cz||0)-W.z).toFixed(2);   // record vs graph: 0 means they agree
    // Approach from four sides and keep whichever one the crosshair actually lands a mesh on within reach. The door's
    // own orientation field is not trusted here — the ray decides.
    let best=null;
    for(const [ox,oz] of [[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){
      const px=TX+ox, pz=TZ+oz;
      player.pos.set(px,Y,pz); player.yaw=Math.atan2(-(TX-px),-(TZ-pz)); player.pitch=0;
      camera.position.copy(player.pos); camera.rotation.set(0,player.yaw,0); camera.updateMatrixWorld(true);
      const rc=new THREE.Raycaster(); rc.setFromCamera({x:0,y:0}, camera); rc.far=3.0;
      const hits=rc.intersectObject(scene,true).filter(h=>h.object&&h.object.visible&&h.object.isMesh);
      if(hits.length && (!best || hits[0].distance<best.h.distance)) best={ h:hits[0], px, pz, yaw:player.yaw };
    }
    if(!best) return Object.assign(out,{ why:'crosshair hit nothing within 3 m from any side' });
    // stand where the winning ray was cast from
    player.pos.set(best.px,Y,best.pz); player.yaw=best.yaw; player.pitch=0;
    camera.position.copy(player.pos); camera.rotation.set(0,player.yaw,0); camera.updateMatrixWorld(true);
    const M=best.h.object; out.hit=true; out.hitDist=+best.h.distance.toFixed(2); out.hitName=M.name||'(unnamed)';
    // IS THE MESH THE RAY HIT PART OF A DOOR'S SWING AT ALL? Walking up from the hit tells us whether the crosshair is
    // even pointing at something that can move — a hit on a merged static wall standing in the doorway is exactly the
    // "invisible/blocking geometry" complaint and must not be reported as a door failure.
    const pivSet=new Set(); for(const L of (d.pivots||[])) if(L&&L.pivot) pivSet.add(L.pivot);
    let up=M, onSwing=false, depth=0;
    while(up && depth++<12){ if(pivSet.has(up)){ onSwing=true; break; } up=up.parent; }
    out.hitIsOnThisDoorsSwing=onSwing;
    const q0=new THREE.Quaternion(); M.getWorldQuaternion(q0);
    const p0=new THREE.Vector3(); M.getWorldPosition(p0);
    out.toggled = !!brTryToggleDoor();                       // the real right-click entry, unmodified
    for(let k=0;k<120;k++) brUpdateDoors(0.05);              // let the swing finish
    const q1=new THREE.Quaternion(); M.getWorldQuaternion(q1);
    const p1=new THREE.Vector3(); M.getWorldPosition(p1);
    out.angleDeg = +(2*Math.acos(Math.min(1,Math.abs(q0.dot(q1))))*180/Math.PI).toFixed(2);
    out.posDelta = +p0.distanceTo(p1).toFixed(3);
    out.moved = out.angleDeg>1.0 || out.posDelta>0.05;
    out.stateA = +(d.a||0).toFixed(2); out.stateClosed = !!d.closed;
    // COLLISION: walk the physics body along the view ray through the opening, using the game's own collider. 24 steps
    // of 0.12 covers 2.9 m, so arrival means it passed the door plane rather than merely leaving the start cell.
    const sx=player.pos.x, sz=player.pos.z, dx=-Math.sin(player.yaw), dz=-Math.cos(player.yaw);
    for(let k=0;k<24;k++){ player.pos.x+=dx*0.12; player.pos.z+=dz*0.12; try{ brxCollide(player); }catch(e){} }
    out.walkedM = +Math.hypot(player.pos.x-sx, player.pos.z-sz).toFixed(2);
    out.gotThrough = out.walkedM > 1.9;                      // 1.5 m to reach the leaf, so >1.9 m means past it
    return out; }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__PD=')) return 'already patched';
  if(path.resolve(root).toLowerCase()===path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT (git archive <hash> | tar -x -C <dir>)');
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

    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hcPERF.arm()');
    console.log('enter:  '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);

    console.log('rig:    '+J(await ev('__PD.rig()')));
    console.log('why:    '+J(await ev('__PD.why()')));
    const list=await ev('__PD.list()');
    console.log('doors:  '+(Array.isArray(list)?list.length+' total, '+list.filter(d=>d.piv>0).length+' with pivots':J(list)));

    // Every door, one at a time, through the player path.
    const n=Array.isArray(list)?Math.min(list.length,24):0;
    const rows=[];
    for(let i=0;i<n;i++){ rows.push(await ev('__PD.test('+i+')')); }
    const ok=rows.filter(r=>r&&!r.err);
    const tally={ tested:ok.length,
      noPivots:ok.filter(r=>!r.pivots).length,
      crosshairHit:ok.filter(r=>r.hit).length,
      hitWasThisDoorsSwing:ok.filter(r=>r.hitIsOnThisDoorsSwing).length,
      toggled:ok.filter(r=>r.toggled).length,
      MESH_ACTUALLY_MOVED:ok.filter(r=>r.moved).length,
      stateFlippedButMeshDidNot:ok.filter(r=>r.toggled&&!r.moved).length,
      walkedThrough:ok.filter(r=>r.gotThrough).length };
    console.log('\nTALLY:  '+J(tally));
    console.log('\nrows:');
    for(const r of rows) console.log('  '+J(r));
    console.log('\nrig after: '+J(await ev('__PD.rig()')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
