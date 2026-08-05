// INVISIBLE BLOCKS, AND WHETHER THEY ARE ALSO THE DOORWAYS YOU CANNOT WALK THROUGH.
//
// Ben, from playing it: "there were invisible blocks everywhere still" and "i couldnt walk through some open doorways".
// 22900's synthesis, and it is the right one: those are one symptom. The halls are MESHES floating inside a solid voxel
// volume that brSlabColumn carves per column — so a cell the carve missed is solid with nothing drawn in it, and a
// player who walks into one has no way to describe it except as a doorway that would not let him through. A traversal
// rig that approaches every door ideally sails straight past that, because it tests the doorway you can SEE.
//
// The census is a predicate, not a raycast: for a grid of cells across the halls at foot and chest height,
//   SOLID  = solidAt(x,y,z), the game's own voxel test — what stops the body;
//   OPEN   = the mesh halls say this is floor you should be standing on: brxRoomAt finds a room here, the point is not
//            inside a wall record's thickness, and it is not inside a door leaf, pillar, table, box or crawl.
// SOLID and OPEN together is an invisible block. Neither number is bookkeeping: one is the collider, the other is the
// geometry, and they are supposed to be the same shape.
//
// Then the intersection 22900 asked for: every DOORWAY AND OPENING footprint — doors, leafless frames, lintels and
// crawls — sampled across its span, reporting how many of those samples are voxel-solid. A non-empty answer there is
// Ben's second symptom with a coordinate attached.
//
// usage: node bench/br-invisible.mjs      (HC_ROOT=<pinned tree>)
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
window.__IV={
  // Is this point open FLOOR by the mesh halls' own records? Deliberately conservative: anything the environment claims
  // as structure is excluded, so what survives is space the player is meant to occupy.
  openAt(x,z){ const r=brxRoomAt(x,z); if(!r) return false;
    const near=(ax,az,bx,bz,rad)=>{ const dx=bx-ax,dz=bz-az,ll=dx*dx+dz*dz||1; let t=((x-ax)*dx+(z-az)*dz)/ll; t=t<0?0:t>1?1:t;
      return Math.hypot(x-(ax+dx*t), z-(az+dz*t)) < rad; };
    const WT=BR_WT/2+0.05;
    for(const s of (BR.walls||[])) if(near(s.x0,s.z0,s.x1,s.z1,WT)) return false;
    for(const s of (BR.solids||[])) if(near(s.x0,s.z0,s.x1,s.z1,WT)) return false;
    for(const s of (BR.crawls||[])) if(near(s.x0,s.z0,s.x1,s.z1,WT)) return false;
    for(const d of (BR.doors||[])) if(d.seg && near(d.seg.x0,d.seg.z0,d.seg.x1,d.seg.z1,WT)) return false;
    for(const p of (BR.pillars||[])) if(Math.hypot(x-p.x,z-p.z) < p.hw+0.05) return false;
    for(const t of (BR.tables||[])){ const vt=Math.abs(t.rot)>0.1; if(Math.abs(x-t.x)<(vt?0.75:t.len/2) && Math.abs(z-t.z)<(vt?t.len/2:0.75)) return false; }
    for(const b of (BR.boxes||[])) if(Math.abs(x-b.x)<b.hx && Math.abs(z-b.z)<b.hz) return false;
    return r; },
  // THE CENSUS. Cells across a square centred on the player, at foot and chest height, comparing the collider against
  // the geometry. Height comes from the room the cell is in, not from the player, so a storey offset cannot fake it.
  census(halfM, step){
    // HEIGHT COMES FROM THE PLAYER'S OWN CELL, and the radius stays inside one storey. A room record carries no y, and
    // every BRX chunk sits on its own base Y (brxLevelDy), so a single global floor height marks the whole census solid
    // and reads as 100% invisible blocks — which is the instrument, not the game. The player's feet are standing on the
    // floor of the storey they are in, by definition. Sanity is reported, not assumed: if the cell the player occupies
    // reads solid, the sampling is wrong and no other number here means anything.
    const H=halfM||20, S=step||1, cx=player.pos.x, cz=player.pos.z;
    const yFeet=Math.floor(player.pos.y-0.1), yChest=yFeet+1;
    const selfFoot=solidAt(Math.floor(cx), yFeet, Math.floor(cz)), selfChest=solidAt(Math.floor(cx), yChest, Math.floor(cz));
    let cells=0, open=0, solidFoot=0, solidChest=0, both=0; const hits=[];
    for(let x=cx-H; x<=cx+H; x+=S) for(let z=cz-H; z<=cz+H; z+=S){
      cells++;
      const r=this.openAt(x,z); if(!r) continue;
      open++;
      const f=solidAt(Math.floor(x), yFeet, Math.floor(z));
      const c=solidAt(Math.floor(x), yChest, Math.floor(z));
      if(f) solidFoot++; if(c) solidChest++;
      if(f||c){ both++; if(hits.length<12) hits.push({x:+x.toFixed(1), z:+z.toFixed(1), foot:!!f, chest:!!c}); }
    }
    return { yFeet, playerCellSolid:{foot:!!selfFoot, chest:!!selfChest}, cells, openCells:open,
             solidFoot, solidChest, invisible:both, pct: open? +(100*both/open).toFixed(2) : null, sample:hits }; },
  // EVERY OPENING, not every door: doors, leafless frames, lintels (which is where the archways and doorways live) and
  // crawl passages. Sampled ACROSS the opening at chest height — the cell a body actually has to pass through.
  openings(){
    const rows=[]; const add=(kind,cx,cz,vert,w)=>{ const n=5, out=[]; let blocked=0;
      for(let i=0;i<n;i++){ const t=(i/(n-1)-0.5)*(w*0.8), x=cx+(vert?0:t), z=cz+(vert?t:0);
        const s=solidAt(Math.floor(x), Math.floor(player.pos.y-0.1)+1, Math.floor(z)); if(s) blocked++; out.push(s?1:0); }
      rows.push({kind, at:[+cx.toFixed(1),+cz.toFixed(1)], w:+w.toFixed(2), blocked, span:out.join('')}); };
    for(const d of (BR.doors||[])) add('door', d.cx, d.cz, d.vert, d.dw||2);
    for(const f of (BR.frames||[])) add('frame', f.cx, f.cz, f.vert, f.dw||2);
    for(const l of (BR.lintels||[])){ const c=(l.s0+l.s1)/2, w=l.s1-l.s0;
      add(l.arch?'arch':'lintel', l.vert?l.fixed:c, l.vert?c:l.fixed, l.vert, w); }
    for(const c of (BR.crawls||[])) add('crawl', (c.x0+c.x1)/2, (c.z0+c.z1)/2, Math.abs(c.x1-c.x0)<0.01, Math.max(Math.abs(c.x1-c.x0),Math.abs(c.z1-c.z0)));
    const byKind={}; for(const r of rows){ const k=byKind[r.kind]=byKind[r.kind]||{n:0,blocked:0,fully:0}; k.n++; if(r.blocked)k.blocked++; if(r.blocked===5)k.fully++; }
    return { total:rows.length, byKind, worst:rows.filter(r=>r.blocked).slice(0,12) }; },
  // WHY IS THIS CELL SOLID. brSlabColumn writes bedrock, concrete below the floor, carpet AT the floor and a ceiling at
  // topY — and NOTHING in between. So a solid cell at chest height cannot be this column's own storey: it has to be a
  // slab laid under a DIFFERENT storey, which is what brxChunkBaseY per BRX chunk makes possible. This reports the two
  // numbers that separate those: the floor the carve would compute for this column, and the floor the player is on.
  explain(x,z){
    const yF=Math.floor(player.pos.y-0.1), bc=brxChunkOf(x,z);
    const col=[]; for(let y=yF-2;y<=yF+3;y++) col.push({y, b:getBlock(Math.floor(x),y,Math.floor(z))});
    let base=null; try{ base=brxChunkBaseY(bc.gx,bc.gz); }catch(e){}
    let pbase=null; try{ const pc=brxChunkOf(player.pos.x,player.pos.z); pbase=brxChunkBaseY(pc.gx,pc.gz); }catch(e){}
    let stair=null; try{ stair=brStairSpanAt(x,z)||null; }catch(e){}
    let vd=null; try{ vd=!!brVoidAt(x,z); }catch(e){}
    const r=brxRoomAt(x,z);
    return { at:[+x.toFixed(1),+z.toFixed(1)], chunk:bc.gx+'_'+bc.gz, carveFloor:base, playerChunkFloor:pbase,
             playerFeetY:yF, sameStorey:(base===pbase), stair:!!stair, voidCol:vd, room:!!r, column:col }; },
  // BEN'S ACTUAL EXPERIENCE, ASKED DIRECTLY: walk the body until something stops it, then ask what the player would SEE
  // at that moment — a mesh within reach of the crosshair, and the luminance of the middle of the frame. Blocked with a
  // surface in front of you is a wall. Blocked with nothing drawn in front of you is an invisible block, and it is the
  // same event whether the cause is a missing mesh, a culled one, a failed material or a stale chunk. This asks the
  // question in pixels AND in collision at once, which the solid-versus-record census could not.
  bumps(nWalks, steps){
    const N=nWalks||24, S=steps||60, out={walks:0, blocked:0, blockedWithSurface:0, blockedWithNothing:0, cases:[]};
    const rc=new THREE.Raycaster(); rc.far=1.6;
    const y=player.pos.y, ox=player.pos.x, oz=player.pos.z;
    for(let w=0; w<N; w++){
      // deterministic spread of directions and start offsets — no Math.random, so two runs compare
      const ang=(w/N)*Math.PI*2, sx=ox+Math.cos(ang)*6, sz=oz+Math.sin(ang)*6;
      player.pos.set(sx,y,sz); try{ brxCollide(player); }catch(e){}
      out.walks++;
      let stuck=0;
      for(let k=0;k<S;k++){
        const bx=player.pos.x, bz=player.pos.z;
        player.pos.x+=Math.cos(ang)*0.12; player.pos.z+=Math.sin(ang)*0.12;
        try{ brxCollide(player); }catch(e){}
        const moved=Math.hypot(player.pos.x-bx, player.pos.z-bz);
        if(moved>0.06){ stuck=0; continue; }
        if(++stuck<3) continue;                                  // one contact frame is a graze; three is a stop
        out.blocked++;
        player.yaw=Math.atan2(-Math.cos(ang), -Math.sin(ang)); player.pitch=0;
        camera.position.set(player.pos.x, player.pos.y+1.4, player.pos.z);
        camera.rotation.set(0, player.yaw, 0); camera.updateMatrixWorld(true);
        // LOOK LOW AS WELL AS LEVEL. A dinner table or a junk pile stops the body at knee height and is entirely
        // legitimate, but an eye-level crosshair sees straight over it and the stop reads as invisible. Three pitches,
        // and a hit at any of them means there IS something there to see.
        let h=[];
        for(const p2 of [0,-0.5,-0.9,0.3]){
          camera.rotation.set(p2, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
          rc.setFromCamera({x:0,y:0}, camera);
          h=rc.intersectObject(scene,true).filter(o=>o.object&&o.object.isMesh&&o.object.visible);
          if(h.length) break; }
        camera.rotation.set(0, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
        // WHAT IS ON SCREEN, not what is in the graph: render and read the middle of the frame back out of GL.
        renderer.render(scene,camera);
        const gl=renderer.getContext(), W=64, H=64;
        const px=Math.max(0,((gl.drawingBufferWidth-W)>>1)), py=Math.max(0,((gl.drawingBufferHeight-H)>>1));
        const buf=new Uint8Array(W*H*4); gl.readPixels(px,py,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf);
        let sum=0; for(let i=0;i<W*H;i++) sum+=0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2];
        const lum=+(sum/(W*H)).toFixed(1);
        if(h.length){ out.blockedWithSurface++; }
        else { out.blockedWithNothing++;
          if(out.cases.length<10){
            // WHICH RECORD IS HOLDING THE BODY. brSlabColumn writes nothing between floor and ceiling, so a stop at
            // chest height is a BRX record collider, and naming it is the difference between a bug report and a number.
            const X=player.pos.x, Z=player.pos.z, RAD=0.42+BR_WT/2, who=[];
            const seg=(ax,az,bx,bz,rad,what)=>{ const dx=bx-ax,dz=bz-az,ll=dx*dx+dz*dz||1; let t=((X-ax)*dx+(Z-az)*dz)/ll; t=t<0?0:t>1?1:t;
              const dd=Math.hypot(X-(ax+dx*t), Z-(az+dz*t)); if(dd<rad) who.push(what+'@'+dd.toFixed(2)); };
            (BR.walls||[]).forEach((s2,i)=>seg(s2.x0,s2.z0,s2.x1,s2.z1,RAD,'wall'+i));
            (BR.solids||[]).forEach((s2,i)=>seg(s2.x0,s2.z0,s2.x1,s2.z1,RAD,'solid'+i));
            (BR.crawls||[]).forEach((s2,i)=>seg(s2.x0,s2.z0,s2.x1,s2.z1,RAD,'crawl'+i));
            (BR.doors||[]).forEach((d2,i)=>{ if(d2.a!=null&&d2.a<=1.15&&d2.seg) seg(d2.seg.x0,d2.seg.z0,d2.seg.x1,d2.seg.z1,0.42,'doorseg'+i); });
            (BR.pillars||[]).forEach((p2,i)=>{ if(Math.hypot(X-p2.x,Z-p2.z)<p2.hw+0.42) who.push('pillar'+i); });
            (BR.tables||[]).forEach((t2,i)=>{ const vt=Math.abs(t2.rot)>0.1; if(Math.abs(X-t2.x)<(vt?0.75:t2.len/2)+0.42 && Math.abs(Z-t2.z)<(vt?t2.len/2:0.75)+0.42) who.push('table'+i); });
            (BR.boxes||[]).forEach((b2,i)=>{ if(Math.abs(X-b2.x)<b2.hx+0.42 && Math.abs(Z-b2.z)<b2.hz+0.42) who.push('box'+i); });
            out.cases.push({x:+X.toFixed(1), z:+Z.toFixed(1), y:+player.pos.y.toFixed(1), lum,
                            heldBy:who.slice(0,4), dir:+(ang*57.3).toFixed(0)}); } }
        break;
      }
    }
    player.pos.set(ox,y,oz);
    return out; },
  // OVERWORLD CONTROL, and it has to be a different question out there: nothing carves the overworld, so "solid where a
  // record says open" has no meaning. Instead: a solid cell with open air beside it and NO MESH drawn on that face —
  // cast a short ray from the open neighbour into the cell and see whether anything is there to be seen.
  overworld(halfM, step){
    const H=halfM||24, S=step||1, cx=player.pos.x, cz=player.pos.z, cy=Math.floor(player.pos.y);
    const rc=new THREE.Raycaster(); rc.far=1.0; const dir=new THREE.Vector3(), org=new THREE.Vector3();
    let exposed=0, invisible=0, offscreen=0; const hits=[];
    for(let x=Math.floor(cx-H); x<=cx+H; x+=S) for(let z=Math.floor(cz-H); z<=cz+H; z+=S) for(let y=cy-2; y<=cy+2; y++){
      if(!solidAt(x,y,z)) continue;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        if(solidAt(x+dx,y,z+dz)) continue;                          // not exposed on this face
        exposed++;
        // ORIGIN IN THE OPEN NEIGHBOUR CELL, not 1.2 m out: a ray starting 1.2 m away usually starts INSIDE the next
        // solid cell along, so its front faces are behind the origin and it hits nothing — 61% of exposed faces read as
        // invisible on that mistake alone.
        org.set(x+0.5+dx*0.95, y+0.5, z+0.5+dz*0.95); dir.set(-dx,0,-dz);
        rc.set(org, dir);
        // NO .visible FILTER HERE. The game culls chunk meshes by setting visible=false, so filtering on it turns this
        // into a frustum-culling census: a mesh that exists but is off-screen reads as a hole in the world. Existence is
        // the question, and _vis records what the filtered answer would have been.
        const all=rc.intersectObject(scene,true).filter(o=>o.object&&o.object.isMesh);
        const h=all; if(all.length && !all[0].object.visible) offscreen++;
        if(!h.length){ invisible++;
          // WHAT is this cell, and is it on a chunk seam. A mesher that drops faces at a chunk edge, or a block whose
          // model does not fill its cell, are different bugs with the same reading, and the block id separates them.
          if(hits.length<10){ rc.far=4; const far=rc.intersectObject(scene,true).filter(o=>o.object&&o.object.visible&&o.object.isMesh);
            hits.push({x,y,z,face:[dx,dz], b:getBlock(x,y,z), seamX:((x%16)+16)%16===0, seamZ:((z%16)+16)%16===0,
                       anyMeshWithin4m:far.length?+far[0].distance.toFixed(2):null}); rc.far=1.0; } }
        break;                                                      // one exposed face is enough to judge the cell
      }
    }
    // CAN THIS PROBE SEE A MESH AT ALL? Straight down from the player onto the ground he is provably standing on. If
    // this misses, every "invisible" above is the raycaster failing to reach the terrain, not a hole in the world.
    rc.far=6; rc.set(new THREE.Vector3(player.pos.x, player.pos.y+2, player.pos.z), new THREE.Vector3(0,-1,0));
    const g=rc.intersectObject(scene,true).filter(o=>o.object&&o.object.visible&&o.object.isMesh);
    return { exposedCells:exposed, invisibleFaces:invisible, hitButOffscreen:offscreen, pct: exposed? +(100*invisible/exposed).toFixed(2):null,
             groundSeen:g.length>0, groundDist:g.length?+g[0].distance.toFixed(2):null, sample:hits }; }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__IV=')) return 'already patched';
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

    // OVERWORLD FIRST, and deliberately: Ben said the invisible blocks were there "still", i.e. before tonight. If they
    // are out here too then this is not a Backrooms bug at all and it belongs on somebody else's list.
    console.log('OVERWORLD: '+J(await ev('__IV.overworld(20,1)')));

    console.log('enter:    '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    console.log('census:   '+J(await ev('__IV.census(40,1)')));
    console.log('openings: '+J(await ev('__IV.openings()')));
    const op=await ev('__IV.openings()');
    if(op&&op.worst) for(const w of op.worst.slice(0,4)) console.log('  why '+w.kind+': '+J(await ev('__IV.explain('+w.at[0]+','+w.at[1]+')')));
    const bp=await ev('__IV.bumps(24,60)');
    console.log('bumps(entry):   '+J(bp&&{walks:bp.walks,blocked:bp.blocked,withSurface:bp.blockedWithSurface,withNothing:bp.blockedWithNothing}));
    if(bp&&bp.cases) for(const c of bp.cases.slice(0,3)) console.log('  why bump: '+J(await ev('__IV.explain('+c.x+','+c.z+')')));
    // THE PATHS A PLAYER EXERCISES, not the one a bench exercises. Invisible geometry classically comes from remesh and
    // unload-reload, not from first generation, and Ben's word was "still" — he had been playing, not just arriving.
    await ev('(()=>{const y=player.pos.y; player.pos.x+=260; brxStream(true); player.pos.x-=260; brxStream(true); player.pos.y=y;})()');
    await sleep(1500);
    console.log('bumps(reload):  '+J(await ev('__IV.bumps(24,60)')));
    console.log('census(reload): '+J(await ev('__IV.census(20,1)')));
    await ev('(()=>{try{brLeave&&brLeave();}catch(e){}})()'); await sleep(1500);
    console.log('re-enter: '+J(await ev('__hcPERF.enterBR()'))); await sleep(2500);
    console.log('bumps(re-enter):  '+J(await ev('__IV.bumps(24,60)')));
    console.log('census(re-enter): '+J(await ev('__IV.census(20,1)')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
