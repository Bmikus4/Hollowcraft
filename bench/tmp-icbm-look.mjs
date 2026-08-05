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
// THE PITCH LIST HAS TO COVER LOOKING DOWN. It ran [-0.25 .. 0.6], so once the clear-line search correctly put the camera 20
// blocks ABOVE the pad at 33.7 degrees of elevation — needing about -0.59 rad — the closest pitch it could offer was -0.25 and
// the best offset it could reach was 188px. The search was right and the aimer could not follow it.
const AIM = (x,y,z)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  let best=null;
  for(let i=0;i<64;i++){ const yaw=i/64*Math.PI*2;
    for(const pit of [-0.95,-0.8,-0.65,-0.5,-0.35,-0.25,-0.12,0,0.12,0.25,0.4,0.6]){ __hcBR.look(yaw,pit); await f(); await f();
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
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
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
      // CLEAR-LINE SEARCH. Two blind attempts failed for opposite reasons: __hc.tp 34 back ground-snaps and the site is a PLATEAU,
      // so the camera landed in the hollow BELOW the apron and aimed steeply up at sky; __hc.tpExact at pad+26 landed inside the
      // TREE CANOPY over the plateau, a black frame with a 170px aim offset because projection feedback cannot centre what it
      // cannot see. A site in a wooded hollow has no vantage you can guess: below it you see sky, above it you see leaves.
      //
      // So the vantage is MEASURED instead of chosen. Ray-march from each candidate to the pad and count what is in the way; keep
      // a candidate with a genuinely unobstructed line, preferring an elevation near 25 degrees because that is what shows an
      // apron as a disc rather than edge-on. The march runs IN THE PAGE -- one evaluate, not one round trip per block.
      //   The first and last few blocks of each ray are skipped: the camera can sit just inside foliage that does not occlude the
      // view, and the pad's own posts and gantry sit at the target end and would otherwise veto every candidate.
      const vantage = await pg.evaluate(`(()=>{
        const tx=${p.x}+0.5, ty=${p.y}+2, tz=${p.z}+0.5;
        const solid=(x,y,z)=>{ const b=__hc.blockAt(Math.floor(x),Math.floor(y),Math.floor(z)); return b!==0; };
        let best=null;
        for(let i=0;i<24;i++){ const th=i/24*Math.PI*2;
          for(const dist of [30,40,52,64]) for(const up of [6,12,20,30,42]){
            const cx=tx+Math.cos(th)*dist, cz=tz+Math.sin(th)*dist, cy=ty+up;
            if(__hc.blockAt(Math.floor(cx),Math.floor(cy),Math.floor(cz))!==0) continue;   // camera itself buried
            const dx=tx-cx, dy=ty-cy, dz=tz-cz, len=Math.hypot(dx,dy,dz), steps=Math.ceil(len);
            let blocked=0;
            for(let k=3;k<steps-4;k++){ const t=k/steps;
              if(solid(cx+dx*t, cy+dy*t, cz+dz*t)) blocked++; }
            if(blocked>0) continue;
            const elev=Math.atan2(up, dist)*180/Math.PI;
            const score=-Math.abs(elev-25)*2 - Math.abs(dist-44)*0.15;      // near 25 degrees, comfortably back
            if(!best||score>best.score) best={cx,cy,cz,dist,up,elev:+elev.toFixed(1),score}; } }
        return best; })()`);
      console.log('  vantage: '+JSON.stringify(vantage && {dist:vantage.dist, up:vantage.up, elev:vantage.elev}));
      if(vantage){ await pg.evaluate(`__hc.tpExact(${vantage.cx}, ${vantage.cz}, ${vantage.cy})`); await sleep(9000); }
      else { console.log('  NO CLEAR LINE FOUND — falling back to a ground stand'); await pg.evaluate(`__hc.tp(${p.x}, ${p.z+34})`); await sleep(9000); }
      console.log('  aim pad: '+JSON.stringify(await pg.evaluate(AIM(p.x+0.5, p.y+2, p.z+0.5))));
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
