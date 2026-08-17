// SILHOUETTE PORTRAIT OF EACH CREATURE, ALONE IN FRAME. Ben: "one of them was rendering but its arms and legs were inverted
// and inward". That is a claim about SHAPE, and shape is unreadable through a material — so each body is painted flat unlit
// red (__hc.kindPlain) and photographed against the world, which turns the frame into a silhouette test.
//
// THE OTHER THREE ARE HIDDEN FOR EVERY SHOT, and that is the whole reason this exists rather than tmp-crop. kindLook places
// its subject `dist` blocks in front of the PLAYER, and the frozen parent Wretch was already standing at that spot — so the
// meek and burrower crops of 20:44 are photographs of the Wretch's back with the subject clipped off to one side.
//
//   node bench/look-silhouette.mjs   → bench/results/look/sil-<kind>.png (full frame) + sil-<kind>-zoom.png (3x crop)
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/look');
const W=900,H=600;
const KINDS=['wretch','meek','burrower','tenant'];
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
    await ev('__hc.meek(1)'); await ev('__hc.burrower(9)');
    for(let i=0;i<40;i++){ const r=await ev('__hc.burrower()'); if(r.visible) break; await sleep(120); }

    const shoot=async(k, dist)=>{
      // kindHide DOES NOT HOLD on the parent Wretch: placeWretch runs every frame and sets group.visible itself, so the flag
      // is cleared before the shutter opens. That is why the 20:44 crops of the meek and the burrower are photographs of the
      // Wretch's back. The parent is WALKED AWAY instead (wretchAt), which nothing in the frame loop undoes.
      if(k!=='wretch') await ev('__hc.wretchAt(120)');
      for(const o of KINDS) if(o!=='wretch') await ev(`__hc.kindHide('${o}',${o!==k})`);
      await sleep(250);
      // Twice: the first call moves the body and the box is computed before the rig has been placed at the new spot.
      let L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      L=await ev(`__hc.kindLook('${k}', ${dist})`); await sleep(400);
      if(L.err){ console.log(k+': '+L.err); return; }
      await ev(`__hc.kindPlain('${k}',true)`); await sleep(350);
      const f=path.join(OUT,'sil-'+k+'.png'); await pg.screenshot({path:f});
      await ev(`__hc.kindPlain('${k}',false)`);
      const x=Math.max(0,Math.round(L.box.x*W)-40), y=Math.max(0,Math.round(L.box.y*H)-40);
      const w=Math.min(W-x,Math.round(L.box.w*W)+80), h=Math.min(H-y,Math.round(L.box.h*H)+80);
      spawnSync('ffmpeg',['-y','-loglevel','error','-i',f,'-vf','crop='+w+':'+h+':'+x+':'+y+',scale=iw*3:ih*3:flags=neighbor',path.join(OUT,'sil-'+k+'-zoom.png')]);
      const S=await ev(`__hc.kindShape('${k}')`);
      const D=await ev(`__hc.kindDrawn('${k}')`);
      console.log(k.padEnd(9)+'dist '+L.dist+' behind '+L.behind+'  box '+JSON.stringify(L.box)+'\n         shape '+JSON.stringify(S)+'\n         drawn '+JSON.stringify(D));
    };

    for(const k of ['wretch','meek','burrower']) await shoot(k,10);
    // The room goes up last: tenBox seals the player inside a stone box, so anything shot after it is shot against a wall.
    await ev('__hc.tenBox()'); await sleep(1000); await ev('__hc.tenant(true)'); await sleep(900);
    await shoot('tenant',9);
    for(const o of KINDS) await ev(`__hc.kindHide('${o}',false)`);
    console.log('\n  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
