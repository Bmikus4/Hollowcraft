// THE RETICLE IS A WHOLE CIRCLE, CENTRED IN THE FRAME, ON EVERY DOT GUN (Ben: "holosights still not centered", "the top of
// holosights are still cut off"). assert-holo-align proves the GLASS CENTRE is on the aim axis; that is geometry, not a
// rendering, and it passed for every gun while he kept reporting the fault. This one reads the pixels the player sees: the red
// reticle's own bounding box, its centroid, and whether each of the four cardinal arcs actually got drawn.
//   node bench/assert-holo-pixels.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const GUNS=['ar15_dot','ar15_suppressed_dot','minigun_dot','minigun_suppressed_dot','hunting_rifle_dot','hunting_rifle_suppressed_dot'];
const W=1280,H=720;
// The reticle is the only saturated red in an ADS frame of grey metal and daylight terrain: r well over g and b.
function redStats(buf){
  const png=buf; // raw RGBA from CDP screenshot decoded by sharp-free path below
  return png;
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const out={};
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1000);
    await page.evaluate(`(()=>{ const pr=__hc.probe(); __hc.tp(pr.x, pr.gyHere+2, pr.z); __hc.giveItem('rifle_ammo',200); __hc.freeze(true,false); })()`);
    await sleep(600);
    for(const g of GUNS){
      await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('${g}'); })()`); await sleep(500);
      await page.evaluate(`__hc.aim(true)`); await sleep(1600);
      await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(900);
      // Read the reticle straight off the WebGL canvas: every pixel where red dominates by a wide margin is holographic ring.
      const m = await page.evaluate(`(()=>{
        const cv=document.querySelector('canvas');
        const c2=document.createElement('canvas'); c2.width=cv.width; c2.height=cv.height;
        const x=c2.getContext('2d'); x.drawImage(cv,0,0);
        const d=x.getImageData(0,0,c2.width,c2.height).data;
        const cx=c2.width/2, cy=c2.height/2;
        let n=0,sx=0,sy=0,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; const quad=[0,0,0,0]; const pts=[];
        for(let py=0;py<c2.height;py++) for(let px=0;px<c2.width;px++){
          const i=(py*c2.width+px)*4, r=d[i],gg=d[i+1],bb=d[i+2];
          if(r>110 && r-gg>60 && r-bb>50){ n++; sx+=px; sy+=py;
            if(px<x0)x0=px; if(px>x1)x1=px; if(py<y0)y0=py; if(py>y1)y1=py;
            const dx=px-cx, dy=py-cy;
            if(Math.abs(dx)<Math.abs(dy)) quad[dy<0?0:1]++; else quad[dx<0?2:3]++;
            if(pts.length<4000) pts.push([px,py]); } }
        return { n, w:c2.width, h:c2.height, cx, cy,
                 cen: n?[+(sx/n).toFixed(2),+(sy/n).toFixed(2)]:null,
                 box: n?[x0,y0,x1,y1]:null, quad };
      })()`);
      out[g]=m;
      const scale=m.w/W;
      const cenOff = m.cen ? [ +(m.cen[0]-m.cx).toFixed(2), +(m.cen[1]-m.cy).toFixed(2) ] : null;
      const box=m.box; const top=box?m.cy-box[1]:0, bot=box?box[3]-m.cy:0, lef=box?m.cx-box[0]:0, rig=box?box[2]-m.cx:0;
      console.log('   ', g.padEnd(30), JSON.stringify({n:m.n, cenOff, arms:[+top.toFixed(1),+bot.toFixed(1),+lef.toFixed(1),+rig.toFixed(1)], quad:m.quad}));
      ok(g+': the reticle is actually on screen', m.n>200, {redPx:m.n});
      if(m.n>200){
        // Centred: the red centroid within 3 device px of frame centre. A whole circle: no cardinal quadrant empty, and the
        // top reach within 15% of the bottom reach — a cut-off top shows up as a short top arm, not as a missing ring.
        ok(g+': centred on the frame', Math.hypot(cenOff[0],cenOff[1]) < 3*scale, {cenOff});
        ok(g+': all four arcs drawn', Math.min(...m.quad) > m.n*0.10, {quad:m.quad});
        ok(g+': the top is not cut off', top > bot*0.85 && bot > top*0.85, {top:+top.toFixed(1),bot:+bot.toFixed(1)});
        ok(g+': and it is not cut left or right', lef > rig*0.85 && rig > lef*0.85, {lef:+lef.toFixed(1),rig:+rig.toFixed(1)});
      }
      await page.evaluate(`__hc.aim(false)`); await sleep(350);
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  fs.writeFileSync(path.join(ROOT,'bench','results','holo-pixels.json'), JSON.stringify(out,null,1));
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
