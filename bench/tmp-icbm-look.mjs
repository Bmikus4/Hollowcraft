// LOOK AT THE SILO AND THE MUSHROOM CLOUD. Both are built and tested block-by-block and state-by-state, but nothing has ever
// judged how either READS. That is the one thing a harness cannot answer.
//
// The silo is photographed by waiting for its site to actually stream (an earlier attempt at this called siloForce once, got
// done:false because _sReady was still false, and gave up with a null pad). The cloud is photographed from 150 blocks out --
// beyond NUKE_HURT at 64 -- because a warhead at 24 blocks killed the player and produced a death screen instead of a crater.
//
// usage: node bench/tmp-icbm-look.mjs   -> bench/results/icbm-silo*.png, icbm-cloud*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Aim at a world point by projection feedback — the only aiming that cannot go stale when a thing's height changes.
const AIM = (x,y,z)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  let best=null;
  for(let i=0;i<64;i++){ const yaw=i/64*Math.PI*2;
    for(const pit of [-0.25,-0.1,0.05,0.2,0.4,0.6]){ __hcBR.look(yaw,pit); await f(); await f();
      const s=__hc.screenOf(${x},${y},${z});
      if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw,pit,off}; } } }
  if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); }
  return best; })()`;

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:fb(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const pg=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await pg.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await pg.evaluate('__hc.setTime(0.42)');
    await pg.evaluate('__hcPERF.pinScene()').catch(()=>{});

    // ---- THE SILO ----
    // THE SPOT HAS TO EXIST BEFORE YOU CAN TRAVEL TO IT. _siloFindSpot is throttled to 1 call in 30, so the first siloGoto
    // returns an error and teleports nowhere -- an earlier run of this waited 72 seconds at spawn for a site 500 blocks away to
    // stream. Poll for the spot, THEN travel, THEN wait for _sReady.
    let s=null;
    for(let i=0;i<40;i++){ s=await pg.evaluate('__hc.silo()'); if(s && s.spot) break; await sleep(400); }
    console.log('  spot found: '+JSON.stringify(s && s.spot));
    if(s && s.spot){ await pg.evaluate('__hc.siloGoto()'); await sleep(4000); }
    for(let i=0;i<30;i++){ await sleep(3000);
      s=await pg.evaluate('__hc.silo()');
      if(s && s.ready){ const r=await pg.evaluate('__hc.siloForce()'); if(r && r.done && r.pad){ s=await pg.evaluate('__hc.silo()'); break; } } }
    console.log('  silo: '+JSON.stringify(s && {spot:s.spot, ready:s.ready, done:s.done, pad:s.pad&&{x:s.pad.x,y:s.pad.y,z:s.pad.z}}));
    if(!s || !s.pad){ console.log('  SILO NEVER STREAMED — no shot'); }
    else {
      const p=s.pad;
      // WIDE FRAMING IS UNSOLVED, and this is the version that at least shows something. Two attempts failed:
      //   __hc.tp 34 blocks back ground-snaps, and the site is a PLATEAU, so the camera lands in the hollow BELOW the apron --
      //     the aim came out at pitch +0.6, steeply up, and the pad was never in frame. The lit posts were visible only by luck.
      //   __hc.tpExact at p.y+26 puts the camera inside the TREE CANOPY over the plateau: a black frame with leaves overhead and
      //     a 170px aim offset because the pad was occluded.
      // A site in a wooded hollow leaves no easy vantage: below the pad you see sky, above it you see leaves. What this wants is
      // either a clear-line search (sample candidate camera positions and keep the one with an unobstructed ray to the pad) or a
      // temporary canopy cull. Neither is written. tpExact takes (x, z, y), NOT (x, y, z) -- a documented trap here.
      await pg.evaluate(`__hc.tp(${p.x}, ${p.z+34})`); await sleep(9000);
      console.log('  aim gantry: '+JSON.stringify(await pg.evaluate(AIM(p.x+0.5, p.y+7, p.z+0.5))));
      await sleep(1600); await pg.screenshot({path:path.join(OUT,'icbm-silo-wide.png')});
      // …and closer, on the blockhouse and console.
      await pg.evaluate(`__hc.tp(${p.x}, ${p.z-15})`); await sleep(7000);
      console.log('  aim blockhouse: '+JSON.stringify(await pg.evaluate(AIM(p.x+0.5, p.y+2, p.z-9))));
      await sleep(1600); await pg.screenshot({path:path.join(OUT,'icbm-silo-near.png')});

      // ---- THE CLOUD, from 150 blocks (NUKE_HURT is 64, so this survives) ----
      const q=await pg.evaluate('__hc.probe()');
      const tx=Math.round(q.x)+150, tz=Math.round(q.z);
      const fire=await pg.evaluate(`__hc.icbmFire(150,0)`);
      console.log('  fired at +150: '+JSON.stringify(fire && {x:fire.x,z:fire.z,r:fire.r,chunksDropped:fire.chunksDropped}));
      const gy=await pg.evaluate(`(()=>{ const pr=__hc.icbmProfile(${tx},${tz},4,4); return pr[0].h; })()`);
      for(const [wait,tag] of [[2200,'t2'],[5000,'t7'],[9000,'t16']]){
        await sleep(wait);
        await pg.evaluate(AIM(tx, gy+70, tz));
        await sleep(900);
        await pg.screenshot({path:path.join(OUT,'icbm-cloud-'+tag+'.png')});
        console.log('  cloud '+tag+': '+JSON.stringify(await pg.evaluate('(()=>{const i=__hc.icbm();return {cloud:i.cloud,rads:i.rads};})()')));
      }
    }
    await b.close();
  } finally { try{ srv.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
