// Ben 08-05 night: "there are random blocks underground that still dont become lit when the player is holding a
// torch/light in thier view". RANDOM ones, so it is per-face, and "still" means 650ffe0 / 31ecf4c / 46381a2 did not
// finish it. Held-vs-placed parity is already proven (assert-emitter-parity 39/39, 524e78f), so the question is which
// faces RECEIVE the light.
//
// THE DISCRIMINATOR IS TWO FRAMES OF THE SAME CAVE, and it splits the two possible causes cleanly:
//   ?dbg=lit paints the DELIVERED direct light itself (dot(reflectedLight.directDiffuse, luma) * uScotH.x).
//   - a pixel DARK in the normal frame and BRIGHT in dbg=lit  -> the light arrived and something ate it. That is the
//     scotopic wash / descent, and the gate is back in question however much litK it counts.
//   - a pixel DARK IN BOTH -> no light ever arrived at that face: N.L <= 0 for the held point light, or out of its
//     14-block range. Then the fault is the light, not the wash, and "random" is what per-face N.L looks like in a cave.
// Counting those two populations IS the answer to his report, and neither is a flag.
// node bench/tmp-held-dark.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const px=f=>decodePNG(fs.readFileSync(f));

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  // one room, dug once, then photographed by two page loads at the same spot — the world is deterministic and the room
  // is a block edit, so the second load has to re-dig it. Both arms do the same digging in the same order.
  // A CORRIDOR, NOT A ROOM. The first version dug 7x5x7 and reported 99.44% of the frame LIT, which was not a bug in
  // the classifier: a torch covers a room that size completely, so there were no dark faces to classify. A 26-block
  // corridor puts the far end outside the light's 14 blocks and every intermediate face on the falloff, which is where
  // "random blocks that don't light" have to live. Pillars every 5 blocks give four wall orientations at four distances.
  // FIND A REAL CAVE, DO NOT DIG ONE. Two dug attempts failed the same way and the failure is instructive: a corridor
  // 9 below the surface ran out of the side of a hill, and one 25 below broke into an existing cavern - both times the
  // "cave" frame was daylight, at 98% and 99% lit. The bug is reported in the caves the game generates, so the probe
  // goes to one: a cell with air around it, four blocks of solid rock overhead, and no sky in its column.
  const FINDCAVE=`(function(){ const P=__hc.probe();
    for(let r=8;r<260;r+=4) for(let a=0;a<24;a++){ const th=a*0.2618;
      const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
      const g=__hc.treeGates(x,z); const h=g&&g.h; if(h==null||h<=P.sea+4) continue;
      for(let y=h-30; y<h-8; y++){
        if(__hc.blockAt(x,y,z)!==0 || __hc.blockAt(x,y+1,z)!==0) continue;          // standing room
        if(__hc.blockAt(x,y-1,z)===0) continue;                                      // AND A FLOOR UNDER IT: tpAt does not
        // snap, so a cell floating in a cavern drops the player out of the very cave the probe just found (camera y 31 -> 27,
        // and the frame came back as daylight because they fell somewhere else entirely).
        let roof=true; for(let k=2;k<=5;k++) if(__hc.blockAt(x,y+k,z)===0){ roof=false; break; }
        if(!roof) continue;                                                          // four blocks of rock overhead
        let air=0; for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let dy=0;dy<=2;dy++)
          if(__hc.blockAt(x+dx,y+dy,z+dz)===0) air++;
        if(air<18) continue;                                                         // a chamber, not a crack
        // and something to LOOK at: the farthest air cell along +x inside 20 blocks
        let far=0; for(let k=1;k<20;k++){ if(__hc.blockAt(x+k,y+1,z)===0) far=k; else break; }
        return {x,y,z,h,air,far};
      } }
    return {err:'no natural cave found'}; })`;
  const run=async(dbg,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1'+(dbg?'&dbg=lit':''),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    await sleep(3000);
    const site=await page.evaluate(FINDCAVE+'()');
    if(site.err) throw new Error(site.err);
    const dug={air:0, roof:1, natural:true, chamberAir:site.air, sightline:site.far};
    await sleep(500);
    // AT ONE END, LOOKING DOWN IT, TORCH IN HAND — and every one of those three is now checked rather than assumed.
    await page.evaluate('__hc.tpAt('+(site.x+0.5)+','+site.y+','+(site.z+0.5)+')');
    await sleep(1500);
    const held=await page.evaluate('__hc.hold("torch")');   // returns {held, slot}: the earlier version read st().hold, which does not exist
    await sleep(1200);
    await page.evaluate('__hc.look('+(site.x+Math.max(2,site.far))+','+(site.y+1)+','+(site.z+0.5)+')');
    await sleep(800);
    await page.evaluate('__hc.look('+(site.x+Math.max(2,site.far))+','+(site.y+1)+','+(site.z+0.5)+')');
    await page.evaluate('__hc.setTime(0.25)'); await sleep(500);
    const f=path.join(ROOT,'bench','results','helddark-'+tag+'.png');
    await page.screenshot({path:f});
    const where=await page.evaluate('(()=>{const p=__hc.probe(); return {y:+p.y.toFixed(1), at:__hc.blockAt(Math.floor(p.x),Math.floor(p.y)+1,Math.floor(p.z))};})()');
    if(Math.abs(where.y-site.y)>1.5) console.log('  *** THE PLAYER FELL out of the cave: asked for y '+site.y+', ended at '+where.y+' ***');
    await page.context().close();
    return { f, site, held, dug, where };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const norm=await run(false,'normal');
    const lit =await run(true ,'lit');
    console.log('site ' + JSON.stringify(norm.site) + '  dug ' + JSON.stringify(norm.dug) +
                '  held ' + JSON.stringify(norm.held) + '  camera ' + JSON.stringify(norm.where));
    if(!norm.held || norm.held.held!=='torch') console.log('  *** NO TORCH IN HAND — every number below is void ***');
    if(norm.dug && norm.dug.air!==0) console.log('  *** THE CORRIDOR IS NOT AIR — the dig did not take ***');
    const A=px(norm.f), B=px(lit.f), ch=A.ch;
    let darkBoth=0, darkButLit=0, brightBoth=0, n=0;
    for(let y=60;y<380;y++) for(let x=100;x<700;x++){
      const i=(y*A.w+x)*ch;
      const a=(A.data[i]+A.data[i+1]+A.data[i+2])/3;      // what you see
      const b=(B.data[i]+B.data[i+1]+B.data[i+2])/3;      // what was delivered
      n++;
      if(a<24 && b>=40) darkButLit++;
      else if(a<24 && b<40) darkBoth++;
      else if(a>=24) brightBoth++;
    }
    // IS THIS EVEN A CAVE? A frame that is 98% lit is either a torch doing its job in a small room or - as it was twice
    // here - the open air. Mean luma settles it before any share is read.
    let sum=0,sn=0; for(let y=60;y<380;y++) for(let x=100;x<700;x++){ const i=(y*A.w+x)*ch; sum+=(A.data[i]+A.data[i+1]+A.data[i+2])/3; sn++; }
    const mean=+(sum/sn).toFixed(2);
    console.log('  mean luma of the normal frame ' + mean + (mean>90?'   *** NOT A CAVE - this is daylight, the numbers below are void ***':''));
    const pc=v=>(100*v/n).toFixed(2)+'%';
    console.log('  dark on screen BUT lit in dbg=lit   ' + pc(darkButLit) + '   <- the wash ate delivered light');
    console.log('  dark in BOTH                        ' + pc(darkBoth)   + '   <- no light ever reached the face');
    console.log('  lit on screen                       ' + pc(brightBoth));
    console.log('  frames bench/results/helddark-normal.png  helddark-lit.png');
  } finally { await browser.close(); server.kill(); }
})();
