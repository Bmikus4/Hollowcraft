// Ben 08-05: "the lighting on trees does not look right any more, the lighting on the foliage on the outside of trees
// especially". Two theories are already dead, both by measurement, and neither should be re-opened:
//   - the sprig's aSky: it was already 0.977, because CUT leaves do not occlude sky, so a canopy column reads open
//     (bench/tmp-sprig-light.mjs). The fix that matched it to the leaf face's own rule moved it to 0.985. Not the bug.
//   - the sprig's NORMAL: giving each sprig the normal of the face it grew from instead of grass's mostly-up normal
//     changes the four-sides luma spread by 0.01 (1.18/1.28 up vs 1.17 face, bench/tmp-sprig-normals.mjs). Not the bug.
// WHAT IS LEFT IS THE LEVEL ITSELF: how dark a sprig is against the canopy it covers. Isolating sprig pixels needs the
// sprigs gone, so __hc.sprigs(false) drops the pass and remeshes; every pixel that changes between the arms is a pixel a
// sprig painted, and the same pixel in the sprigs-off frame is the canopy that sprig is standing in front of.
// node bench/tmp-sprig-vs-canopy.mjs
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

function px(file){ const P=decodePNG(fs.readFileSync(file)); return P; }
// Pixels a sprig painted: differ by more than the frame's own dither between the two arms. Reports the mean luma of
// those pixels in each arm — sprig level vs the canopy level it replaced.
function compare(fOn,fOff){
  const A=px(fOn), B=px(fOff), ch=A.ch;
  let n=0, sOn=0, sOff=0, darker=0;
  for(let y=0;y<440;y++) for(let x=0;x<A.w;x++){
    const i=(y*A.w+x)*ch;
    const la=(A.data[i]+A.data[i+1]+A.data[i+2])/3, lb=(B.data[i]+B.data[i+1]+B.data[i+2])/3;
    if(Math.abs(la-lb)<3) continue;
    n++; sOn+=la; sOff+=lb; if(la<lb) darker++;
  }
  return { sprigPx:n, sprigLuma:n?+(sOn/n).toFixed(2):null, canopyUnderneath:n?+(sOff/n).toFixed(2):null,
           darkerShare:n?+(darker/n).toFixed(3):null };
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:1000,height:560}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    const TIME=0.25;
    await page.evaluate('__hc.setTime('+TIME+')');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    console.log('tree ' + JSON.stringify(spot));
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    await page.evaluate('__hc.tpAt('+(spot.x+18)+','+(spot.h+12)+','+(spot.z+18)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+10)+','+spot.z+')');
    await sleep(1500);
    const shot=async(tag)=>{ await sleep(1200); await page.evaluate('__hc.setTime('+TIME+')'); await sleep(400);
      const f=path.join(ROOT,'bench','results','sprigvc-'+tag+'.png'); await page.screenshot({path:f}); return f; };
    // settle first: the first frame after a remesh reads bright while the stream and relight catch up
    console.log('  ' + JSON.stringify(await page.evaluate('__hc.sprigs(true)')));  await shot('warm');
    const on = await shot('on');
    console.log('  ' + JSON.stringify(await page.evaluate('__hc.sprigs(false)'))); await shot('warm');
    const off= await shot('off');
    console.log(JSON.stringify(compare(on,off),null,0));
    console.log('  frames bench/results/sprigvc-on.png  sprigvc-off.png');
  } finally { await browser.close(); server.kill(); }
})();
