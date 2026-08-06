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
  const CAVE=`(function(site){
    // a 7x5x7 room with a pillar in the middle: the pillar's four walls face four different ways, which is the whole
    // point — one held light, four orientations, in one frame.
    for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) for(let dy=0;dy<5;dy++)
      __hc.setBlockAt(site.x+dx, site.h-9+dy, site.z+dz, 'air');
    for(let dy=0;dy<4;dy++) __hc.setBlockAt(site.x, site.h-9+dy, site.z, 'stone');
    return true; })`;
  const run=async(dbg,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1'+(dbg?'&dbg=lit':''),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    await sleep(3000);
    const site=await page.evaluate(`(()=>{ const P=__hc.probe();
      for(let r=10;r<200;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927;
        const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g&&g.h!=null && g.h>P.sea+6) return {x,z,h:g.h}; } return {err:'no site'}; })()`);
    if(site.err) throw new Error(site.err);
    await page.evaluate(CAVE+'('+JSON.stringify(site)+')');
    await sleep(3000);
    // stand back from the pillar, torch in hand, and look at it
    await page.evaluate('__hc.tpAt('+(site.x+2.5)+','+(site.h-9)+','+(site.z+2.5)+')');
    await sleep(1500);
    await page.evaluate('__hc.hold("torch")');
    await sleep(1200);
    await page.evaluate('__hc.look('+(site.x+0.5)+','+(site.h-8)+','+(site.z+0.5)+')');
    await sleep(800);
    await page.evaluate('__hc.look('+(site.x+0.5)+','+(site.h-8)+','+(site.z+0.5)+')');
    await page.evaluate('__hc.setTime(0.25)'); await sleep(500);
    const f=path.join(ROOT,'bench','results','helddark-'+tag+'.png');
    await page.screenshot({path:f});
    const held=await page.evaluate('(()=>{ try{ return {hold:__hc.st().hold||null}; }catch(e){ return {err:String(e.message||e)}; } })()');
    await page.context().close();
    return { f, site, held };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const norm=await run(false,'normal');
    const lit =await run(true ,'lit');
    console.log('site ' + JSON.stringify(norm.site) + '  held ' + JSON.stringify(norm.held));
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
    const pc=v=>(100*v/n).toFixed(2)+'%';
    console.log('  dark on screen BUT lit in dbg=lit   ' + pc(darkButLit) + '   <- the wash ate delivered light');
    console.log('  dark in BOTH                        ' + pc(darkBoth)   + '   <- no light ever reached the face');
    console.log('  lit on screen                       ' + pc(brightBoth));
    console.log('  frames bench/results/helddark-normal.png  helddark-lit.png');
  } finally { await browser.close(); server.kill(); }
})();
