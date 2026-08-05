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

    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hcPERF.arm()');
    // The overworld frame in daylight is the control the halls have to be compared against: it fixes what this
    // renderer's "lit" looks like on this machine, so a dark hall is a difference and not an absolute.
    console.log('OVERWORLD pixels: '+J(await ev('__LT.pixels()')));

    console.log('enter:    '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    console.log('lights:   '+J(await ev('__LT.lights()')));
    console.log('fixtures: '+J(await ev('__LT.fixtures(24)')));
    console.log('pixels:   '+J(await ev('__LT.pixels()')));
    console.log('under:    '+J(await ev('__LT.standUnderFixture()')));
    await sleep(500);
    console.log('pixels under fixture: '+J(await ev('__LT.pixels()')));
    console.log('lights here: '+J(await ev('__LT.lights()')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
