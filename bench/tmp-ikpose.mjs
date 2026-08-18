// SILHOUETTE PORTRAIT, ALONE IN FRAME. Shape is unreadable through a material, so the body is painted flat unlit red
// (__hc.kindPlain) and photographed against the world, which turns the frame into a pure silhouette test — the thing that
// answers "is a limb inverted" and that no textured screenshot ever settled.
//
// It was written for three forked creatures and outlived them: the method is what is worth keeping, and the Wretch is a
// better subject for it than any of them were.
//
//   node bench/look-silhouette.mjs   → bench/results/ikpose/sil-<kind>.png (full frame) + sil-<kind>-zoom.png (3x crop)
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/ikpose');
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
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.25)'); await ev('__hc.hwHold(true)');
    // The parent runs its own AI and flees in daylight; hwHold only stops the extras, so it needs freezing or the family
    // portrait comes back without its parent.
    await ev('__hc.wretchAt(10)'); await ev('__hc.wretchArm(true,true)'); await sleep(400); await ev('__hc.freeze(true,true)');

    const shoot=async(k, dist, tag)=>{ tag=tag||k;   // k stays the KIND (kindLook needs it); tag only names the file
      // kindHide DOES NOT HOLD on the Wretch: placeWretch runs every frame and sets group.visible itself, so the flag is
      // cleared before the shutter opens. Anything that has to be got out of frame is WALKED AWAY with wretchAt instead,
      // which nothing in the frame loop undoes.
      // Twice: the first call moves the body and the box is computed before the rig has been placed at the new spot.
      let L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      if(L.err){ console.log(k+': '+L.err); return; }
      await ev(`__hc.kindPlain('${k}',true)`); await sleep(350);
      const f=path.join(OUT,tag+'.png'); await pg.screenshot({path:f});
      await ev(`__hc.kindPlain('${k}',false)`);
      const x=Math.max(0,Math.round(L.box.x*W)-40), y=Math.max(0,Math.round(L.box.y*H)-40);
      const w=Math.min(W-x,Math.round(L.box.w*W)+80), h=Math.min(H-y,Math.round(L.box.h*H)+80);
      spawnSync('ffmpeg',['-y','-loglevel','error','-i',f,'-vf','crop='+w+':'+h+':'+x+':'+y+',scale=iw*3:ih*3:flags=neighbor',path.join(OUT,tag+'-zoom.png')]);
      const S=await ev(`__hc.kindShape('${k}')`);
      const D=await ev(`__hc.kindDrawn('${k}')`), K=await ev(`__hc.rigSkew('${k}')`);
      console.log(String(tag).padEnd(9)+'dist '+L.dist+' behind '+L.behind+'  box '+JSON.stringify(L.box)
        +'\n         shape '+JSON.stringify(S)+'\n         drawn '+JSON.stringify(D)+'\n         rig   '+JSON.stringify(K));
    };

    // THE ONLY DELTA FROM look-silhouette: the same shot with the foot IK on and off. Six rewrites of a
    // hand-rolled harness produced six black frames with valid screen boxes; this one has produced a lit
    // silhouette of this creature all along, so it is the one that gets the toggle.
    for(const on of [true,false]){
      await ev('__hc.footIK('+on+')');
      await ev('__hc.freeze(false,false)');
      await ev('__hc.wretchAt(10)');
      await sleep(1800);                                  // let the integrator settle where it stands
      await ev('__hc.freeze(true,true)'); await sleep(300);
      console.log('  footIK '+(on?'on ':'off')+' '+JSON.stringify(await ev('__hc.footIK()')).slice(0,110));
      await shoot('wretch',10,on?'ik-on':'ik-off'); }
    await ev('__hc.footIK(true)');
    // AND THE FORELIMB RETRACTION, which 8b8061f measured and did not look at. Placing the creature among the
    // trees was not enough -- limbInSolid read 0 arms in solid at that spot, so the rule was correctly inert and
    // the two frames were the same pose. A trunk has to be PUT where an arm is, so a pillar is built one block in
    // front of the frozen body at arm height and the integrator is given a moment to answer it.
    for(const on of [true,false]){
      await ev('__hc.armFold('+on+')');
      await ev('__hc.freeze(false,false)');
      await ev('__hc.wretchAt(7)');
      await sleep(1500);
      await ev('__hc.freeze(true,true)'); await sleep(250);
      const built=await ev(`(()=>{ const w=__hc.wpos(); if(!w) return null;
        const yaw=__hc.wretchPose? (__hc.wretchPose().yaw||0) : 0;
        const fx=Math.round(w[0]-Math.sin(yaw)*1.2), fz=Math.round(w[2]-Math.cos(yaw)*1.2);
        const put=[];
        for(let dy=0; dy<=2; dy++) for(let dx=-1; dx<=1; dx++) for(let dz=-1; dz<=1; dz++){
          const x=fx+dx, y=Math.round(w[1])+dy, z=fz+dz;
          if(__hc.blockAt(x,y,z)!==0) continue;
          __hc.setBlk(x,y,z,'stone'); put.push([x,y,z]); }
        return {fx, fz, n:put.length}; })()`);
      // IT STAYS FROZEN WHILE IT ANSWERS. Unfreezing to let the integrator run also lets the creature WALK, and
      // with the collision envelope shipped it simply steps away from the pillar that was just built for it --
      // arms 0 in solid, twice. freeze(on,moving) keeps the rig animating while the body holds still, which is
      // the only state in which a limb can be measured against something put deliberately in its way.
      await sleep(1400);
      console.log('  armFold '+(on?'on ':'off')+' '+JSON.stringify(await ev('__hc.armFold()')).slice(0,90)
        +'  built '+JSON.stringify(built)+'  inSolid '+JSON.stringify(await ev('__hc.limbInSolid()')));
      await shoot('wretch',7,on?'arm-on':'arm-off'); }
    await ev('__hc.armFold(true)');
    console.log('\n  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
