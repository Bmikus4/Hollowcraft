// DOES THE MAZE THE PREWARM CACHED SURVIVE THE RESEED — i.e. is cached Backrooms geometry from the same maze as the
// records the game is collides against and lights?
//
// Three facts from the source, which this run is here to confirm at runtime rather than assert from reading:
//   - brSpawnDoor reseeds: BR.seed = random, BR.rooms=[] (index.html:18569), every time a Void Door opens from outside.
//   - BR.envCache and BR.gen are both keyed 'gx_gz' ONLY (brxBuildChunkGroup, brxChunkGen). The seed is NOT in the key.
//   - The QA seed hook (:21461) calls brEnvCacheClear() when it changes the seed, because a seed change invalidates
//     cached geometry. The reseed on the real door path does not.
//   - And the load-time prewarm reads BR.seed too — the comment at :18560 says so outright: "pin it before that runs or
//     the prewarmed chunks are a different maze."
//
// PERF.brPrecompile now ships ON (Ben's call, 45f6c66), which means the prewarm ALWAYS runs, which makes this the
// DEFAULT path rather than an edge case. If the seed at prewarm time differs from the seed at entry time while the cache
// still holds prewarmed groups, then the halls are geometry from one maze standing in front of collision, fixtures and
// room ids from another — which is the shape of three of Ben's four symptoms at once (invisible blocks, doorways you
// cannot walk through, lights that do not appear).
//
// usage: node bench/br-seed-cache.mjs      (HC_ROOT=<pinned tree>)
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
window.__SC={
  // The seed, and what is cached under it. Cache keys are printed raw so "the key does not mention the seed" is visible
  // rather than argued.
  snap(tag){ const keys=BR.envCache?[...BR.envCache.keys()]:[];
    return { tag, seed:BR.seed>>>0, prewarmDone:BR._prewarmDone|0,
             envCache:keys.length, gen:BR.gen?BR.gen.size:0, rooms:(BR.rooms||[]).length,
             sampleKeys:keys.slice(0,4), inside:!!BR.inside }; },
  // THE DISAGREEMENT ITSELF, per loaded chunk: does the cached GROUP's geometry occupy the same footprint as the walls
  // the records describe? A group built for another maze still lands in the right chunk, so compare content, not bounds:
  // count wall segments in the record against merged meshes in the group, and probe a handful of record wall midpoints
  // for a mesh actually being there. This is the "collision solid vs a mesh exists" test, scoped to one chunk.
  divergence(){
    const out=[];
    for(const rec of (BR.loaded||[])){
      const ck=rec.gx+'_'+rec.gz, ent=BR.envCache&&BR.envCache.get(ck);
      if(!ent||!ent.g) continue;
      let meshes=0; ent.g.traverse(o=>{ if(o.isMesh) meshes++; });
      // ray straight DOWN onto each of a few record wall midpoints: if the record says a wall is there, the cached
      // geometry should have something under the ray.
      const rc=new THREE.Raycaster(); let probed=0, hit=0;
      for(const w of (rec.walls||[]).slice(0,12)){
        const mx=w.vert? w.fixed : (w.s0+w.s1)/2, mz=w.vert? (w.s0+w.s1)/2 : w.fixed;
        rc.set(new THREE.Vector3(mx, BR_WY0+2.4, mz), new THREE.Vector3(0,-1,0)); rc.far=4;
        probed++; if(rc.intersectObject(ent.g,true).length) hit++; }
      out.push({ ck, recWalls:(rec.walls||[]).length, recDoors:(rec.doors||[]).length, groupMeshes:meshes,
                 wallMidsProbed:probed, wallMidsWithGeometry:hit }); }
    return out; },
  // Same chunk, same coordinates, generated ONE more time from the CURRENT seed, deep-compared against the record the
  // game is holding. If the generator is deterministic in (gx,gz,seed) and the seed has not moved, these are identical.
  regen(){
    const rec=(BR.loaded||[])[0]; if(!rec) return {err:'nothing loaded'};
    const ck=rec.gx+'_'+rec.gz;
    const before={ doors:(rec.doors||[]).length, walls:(rec.walls||[]).length, fixtures:(rec.fixtures||[]).length,
                   rooms:(rec.rooms||[]).length, dw:(rec.doors||[]).map(d=>+(d.dw||0).toFixed(2)).slice(0,8) };
    if(BR.gen) BR.gen.delete(ck);                                  // force a real generation, same gx/gz/seed
    const fresh=brxChunkGen(rec.gx, rec.gz);
    const after={ doors:(fresh.doors||[]).length, walls:(fresh.walls||[]).length, fixtures:(fresh.fixtures||[]).length,
                  rooms:(fresh.rooms||[]).length, dw:(fresh.doors||[]).map(d=>+(d.dw||0).toFixed(2)).slice(0,8) };
    return { ck, seed:BR.seed>>>0, before, after,
             identical: JSON.stringify(before)===JSON.stringify(after) }; }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__SC=')) return 'already patched';
  if(path.resolve(root).toLowerCase()===path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT');
  const a='PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if(!s.includes(a)) throw new Error('probe anchor missing');
  fs.writeFileSync(f, s.replace(a, a+PROBE)); return 'patched';
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

    // NO ?brseed by default — the shipping behaviour is the thing under test. BRSEED=N pins it, which is what the
    // per-chunk door-population comparison needs: two runs that differ in nothing the game can see.
    const seedQ = process.env.BRSEED ? '&brseed='+process.env.BRSEED : '';
    await page.goto(base+'/index.html?perf=1&debug=1&rd=8'+seedQ,{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(9000);                                      // let the load-time prewarm finish
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hcPERF.arm()');

    console.log('after load+prewarm: '+J(await ev('__SC.snap("prewarmed")')));
    await ev('__hcBR.door()');                              // the real door path — this is what reseeds
    await sleep(1500);
    console.log('after door spawn:   '+J(await ev('__SC.snap("door spawned")')));
    console.log('enter:              '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    console.log('after entry:        '+J(await ev('__SC.snap("inside")')));
    console.log('\nregen same chunk, same seed: '+J(await ev('__SC.regen()')));
    const d=await ev('__SC.divergence()');
    console.log('\nper-chunk record vs cached geometry:');
    if(Array.isArray(d)) for(const r of d) console.log('  '+J(r)); else console.log('  '+J(d));
    console.log('\npage errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
