// ARE THE FITTINGS AND THE DOORS ACTUALLY TEXTURED — in the material, in the geometry, and on the screen.
//
// Ben 08-05: "texture lights and all doors better". Three ways that work can be present in the source and absent in the
// game, and this checks all three, because any one of them looks like "nothing changed":
//   MATERIAL — does the material carry a map at all;
//   GEOMETRY — does the mesh have a `uv` attribute. The merged troffer housing and diffuser were built from positions and
//              indices ONLY, so a map on them samples a single texel and the whole drawing is invisible;
//   PIXELS   — does the panel show VARIATION on screen. A flat colour and a ribbed diffuser have the same mean
//              luminance; what separates them is the spread, so this reports the standard deviation of a patch centred
//              on a fitting, not its brightness.
//
// usage: node bench/br-surfaces.mjs      (HC_ROOT=<pinned tree>)
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
window.__SF={
  // Every material the halls put on screen, and whether it carries a map. Counted off the live scene graph rather than
  // off the material factories, so a material that is built but never used cannot pad the answer.
  mats(){ const seen=new Map();
    if(BR.env) BR.env.traverse(o=>{ if(!o.isMesh && !o.isInstancedMesh) return;
      for(const m of (Array.isArray(o.material)?o.material:[o.material])){ if(!m) continue;
        const k=m.uuid; if(seen.has(k)) continue;
        seen.set(k, { type:m.type, color:m.color?('#'+m.color.getHexString()):null, map:!!m.map,
                      rough:!!m.roughnessMap, normal:!!m.normalMap,
                      mapSize:m.map&&m.map.image?(m.map.image.width+'x'+m.map.image.height):null,
                      canvas:!!(m.map&&m.map.isCanvasTexture) }); } });
    const rows=[...seen.values()];
    return { materials:rows.length, withMap:rows.filter(r=>r.map).length, canvasMaps:rows.filter(r=>r.canvas).length,
             untextured:rows.filter(r=>!r.map).map(r=>r.type+' '+r.color).slice(0,8) }; },
  // THE UV CHECK, and it is the one that catches the invisible failure. A mesh with a map and no uv attribute renders one
  // texel stretched over the whole surface, which looks exactly like the flat colour it replaced.
  uvs(){ let mapped=0, mappedNoUV=0; const bad=[];
    if(BR.env) BR.env.traverse(o=>{ if(!o.isMesh) return;
      const m=Array.isArray(o.material)?o.material[0]:o.material; if(!m||!m.map) return;
      mapped++;
      if(!o.geometry || !o.geometry.getAttribute('uv')){ mappedNoUV++;
        if(bad.length<6) bad.push({ mat:m.type, verts:o.geometry?o.geometry.getAttribute('position').count:0 }); } });
    return { meshesWithAMap:mapped, mappedButNoUV:mappedNoUV, offenders:bad }; },
  // Point the camera up at the nearest live fitting and read a patch of the FRAME. Mean says how bright it is; STDDEV
  // says whether there is anything drawn on it. Flat colour and ribbed acrylic differ in the second, never the first.
  panelPixels(){
    let best=null;
    for(const f of (BR.fixtures||[])){ if(f.dead) continue;
      const d=Math.hypot(f.x-player.pos.x, f.z-player.pos.z); if(!best||d<best.d) best={f,d}; }
    if(!best) return {err:'no live fixture'};
    player.pos.x=best.f.x; player.pos.z=best.f.z; player.pitch=-1.35; player.yaw=0;
    camera.position.set(player.pos.x, player.pos.y+1.4, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    renderer.render(scene,camera);
    const gl=renderer.getContext(), W=96, H=96;
    const px=Math.max(0,(gl.drawingBufferWidth-W)>>1), py=Math.max(0,(gl.drawingBufferHeight-H)>>1);
    const buf=new Uint8Array(W*H*4); gl.readPixels(px,py,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const L=[]; for(let i=0;i<W*H;i++) L.push(0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2]);
    const mean=L.reduce((a,b)=>a+b,0)/L.length;
    const sd=Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/L.length);
    const mn=Math.min.apply(null,L), mx=Math.max.apply(null,L);
    return { at:[+best.f.x.toFixed(0),+best.f.z.toFixed(0)], mean:+mean.toFixed(1), stddev:+sd.toFixed(2),
             min:+mn.toFixed(0), max:+mx.toFixed(0), range:+(mx-mn).toFixed(0) }; },
  // Same question for a door leaf: stand off it, look at it, read the spread.
  doorPixels(){
    const d=(BR.doors||[]).find(x=>x.pivots&&x.pivots.length); if(!d) return {err:'no rigged door'};
    const tx=d.cx+(d.vert?0:d.dw/4), tz=d.cz+(d.vert?d.dw/4:0);
    const ox=d.vert?1.1:0, oz=d.vert?0:1.1;
    const L0=d.pivots[0]; const W=new THREE.Vector3(); L0.pivot.getWorldPosition(W);
    player.pos.set(d.cx+ox, W.y+1.2, d.cz+oz);
    player.yaw=Math.atan2(-(tx-player.pos.x), -(tz-player.pos.z)); player.pitch=0;
    camera.position.copy(player.pos); camera.rotation.set(0, player.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    renderer.render(scene,camera);
    const gl=renderer.getContext(), Wd=96, Hd=96;
    const px=Math.max(0,(gl.drawingBufferWidth-Wd)>>1), py=Math.max(0,(gl.drawingBufferHeight-Hd)>>1);
    const buf=new Uint8Array(Wd*Hd*4); gl.readPixels(px,py,Wd,Hd,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const Lm=[]; for(let i=0;i<Wd*Hd;i++) Lm.push(0.2126*buf[i*4]+0.7152*buf[i*4+1]+0.0722*buf[i*4+2]);
    const mean=Lm.reduce((a,b)=>a+b,0)/Lm.length;
    const sd=Math.sqrt(Lm.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Lm.length);
    return { kind:d.kind, mean:+mean.toFixed(1), stddev:+sd.toFixed(2) }; },
  // A texture that fails to build takes the environment with it, and a leaked material pins a program. Both are counted.
  cost(){ return { programs:renderer.info.programs?renderer.info.programs.length:null,
                   textures:renderer.info.memory.textures, geometries:renderer.info.memory.geometries }; }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__SF=')) return 'already patched';
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
    console.log('enter:  '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    console.log('mats:   '+J(await ev('__SF.mats()')));
    console.log('uvs:    '+J(await ev('__SF.uvs()')));
    console.log('panel:  '+J(await ev('__SF.panelPixels()')));
    console.log('door:   '+J(await ev('__SF.doorPixels()')));
    console.log('cost:   '+J(await ev('__SF.cost()')));
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
