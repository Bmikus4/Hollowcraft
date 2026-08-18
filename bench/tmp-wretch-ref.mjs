// SILHOUETTE PORTRAIT, ALONE IN FRAME. Shape is unreadable through a material, so the body is painted flat unlit red
// (__hc.kindPlain) and photographed against the world, which turns the frame into a pure silhouette test — the thing that
// answers "is a limb inverted" and that no textured screenshot ever settled.
//
// It was written for three forked creatures and outlived them: the method is what is worth keeping, and the Wretch is a
// better subject for it than any of them were.
//
//   node bench/look-silhouette.mjs   → assets/creature-ref/sil-<kind>.png (full frame) + sil-<kind>-zoom.png (3x crop)
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'assets/creature-ref');
const W=900,H=600;
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    fs.mkdirSync(OUT,{recursive:true});
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)');
    // NO __hc.hud(false) HERE. It blacks the whole frame in this harness -- the plate came back empty with the
    // creature's screen box still valid. The HUD is cropped out by the box crop anyway. await ev('__hc.setTime(0.25)'); await ev('__hc.hwHold(true)');
    // The parent runs its own AI and flees in daylight; hwHold only stops the extras, so it needs freezing or the family
    // portrait comes back without its parent.
    await ev('__hc.wretchAt(10)'); await ev('__hc.wretchArm(true,true)'); await sleep(400); await ev('__hc.freeze(true,true)');

    const shoot=async(k, dist, tag)=>{ tag=tag||k;
      // kindHide DOES NOT HOLD on the Wretch: placeWretch runs every frame and sets group.visible itself, so the flag is
      // cleared before the shutter opens. Anything that has to be got out of frame is WALKED AWAY with wretchAt instead,
      // which nothing in the frame loop undoes.
      // Twice: the first call moves the body and the box is computed before the rig has been placed at the new spot.
      let L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      if(L.err){ console.log(k+': '+L.err); return; }
      const f=path.join(OUT,tag+'.png'); await pg.screenshot({path:f});
      const x=Math.max(0,Math.round(L.box.x*W)-40), y=Math.max(0,Math.round(L.box.y*H)-40);
      const w=Math.min(W-x,Math.round(L.box.w*W)+80), h=Math.min(H-y,Math.round(L.box.h*H)+80);
      spawnSync('ffmpeg',['-y','-loglevel','error','-i',f,'-vf','crop='+w+':'+h+':'+x+':'+y+',scale=iw*3:ih*3:flags=neighbor',path.join(OUT,tag+'-crop.png')]);
      const S=await ev(`__hc.kindShape('${k}')`);
      const D=await ev(`__hc.kindDrawn('${k}')`), K=await ev(`__hc.rigSkew('${k}')`);
      console.log(String(tag).padEnd(14)+'dist '+L.dist+' behind '+L.behind+'  box '+JSON.stringify(L.box)
        +'\n         shape '+JSON.stringify(S)+'\n         drawn '+JSON.stringify(D)+'\n         rig   '+JSON.stringify(K));
    };

    // FIVE ANGLES, ONE PLACE. A creature this asymmetric does not have a reference frame -- the hunch reads from
    // the side, the arm length from three-quarters, the face from the front -- and the model that has to draw it
    // hyperrealistically needs all of them. wretchPut fixes the spot so the light and the ground are common to
    // every plate; kindLook moves the CAMERA, so the facing is re-asserted after it.
    const w=await ev('__hc.wpos()'); const SPOT={x:Math.round(w[0]), z:Math.round(w[2])};
    console.log('staged at '+JSON.stringify(SPOT));
    for(const [tag,yaw,dist] of [['wretch-front',0,5],['wretch-front-far',0,9],['wretch-three-quarter',0.9,5],['wretch-side',1.57,5],['wretch-rear-quarter',2.4,6]]){
      await ev(`__hc.wretchPut(${SPOT.x}, ${SPOT.z}, ${yaw})`); await sleep(300);
      await shoot('wretch',dist,tag);
      await ev(`__hc.wretchPut(${SPOT.x}, ${SPOT.z}, ${yaw})`); await sleep(300); }
    console.log('\n  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
