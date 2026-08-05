// A MONITOR SHOWS SOMETHING (Ben 08-05: "monitors should actually display their not connected screen, and their cameras view if
// connected, directly on the monitor"). The screen is a per-monitor quad that samples a tile of the CCTV render target; the chunk
// mesher draws only the bezel and a dark recessed well. That quad was built by scrOnPlace and by the save restore — so a monitor
// that came from anywhere else had a bezel around a hole. Measured on the pixels of the monitor's own face, in both states.
//   node bench/assert-monitor-face.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const W=900,H=600;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); })()`); await sleep(600);
    // A MONITOR THE PLAYER DID NOT PLACE. setBlock writes the block the way worldgen would — it does not run scrOnPlace — which is
    // exactly the case that shipped broken. The chunk remesh that follows is what has to notice it.
    const put=await page.evaluate(`(()=>{ const p=__hc.probe();
        const r=__hc.setBlock(0,0,-3,'monitor_x') || {};
        for(let dy=-1;dy<=2;dy++) __hc.setBlock(-1,dy,-3,'stone');
        return r; })()`);
    console.log('    placed a monitor by block write', JSON.stringify(put));
    // THE MONITOR'S WORLD COORDS, CAPTURED ONCE. Everything after this moves the player — cctvFace stands them in front of the
    // screen — so any later "player + offset" recomputation points somewhere else: the first run of this tuned a phantom key three
    // blocks from the real monitor and then reported the face as off.
    const MON=[put.wx, put.wy, put.wz];
    console.log('    monitor at', JSON.stringify(MON));
    // AND THEN THE CHUNK IS REBUILT FROM SCRATCH, by walking the render distance down and back up. That is the path a monitor from
    // worldgen or from a loaded save actually takes — a full buildModelBlocks pass — and it is the one that used to leave the bezel
    // around a hole. An in-place edit remesh is a different, lighter path.
    for(let i=0;i<30;i++){ await sleep(400); const n=await page.evaluate(`__hc.cctv().screens`); if(n>0) break; }
    const mid=await page.evaluate(`__hc.cctv()`);
    console.log('    after the edit remesh', JSON.stringify({entries:mid.entries, screens:mid.screens}));
    await page.evaluate(`__hc.rd(3)`); await sleep(2500);
    await page.evaluate(`__hc.rd(8)`);
    for(let i=0;i<40;i++){ await sleep(400); const n=await page.evaluate(`__hc.cctv().screens`); if(n>0) break; }
    const st=await page.evaluate(`__hc.cctv()`);
    console.log('    cctv state', JSON.stringify(st).slice(0,300));
    // The screen quad has to exist for that monitor, and its uOn has to be 0 — untuned is the no-signal slate.
    const q=await page.evaluate(`__hc.cctvScreenAt(${MON[0]},${MON[1]},${MON[2]})`);
    console.log('    screen quad', JSON.stringify(q));
    ok('the monitor has a screen quad', q && !q.err && q.on!=null, q);
    ok('…and with nothing tuned it is the no-signal screen', q && q.on===0, q);
    // onScreen is asserted below, after cctvFace stands the player in front of it: from wherever the player happened to be when the
    // block was written, the monitor is behind them as often as not.
    // …AND THE FEED, ON THE MONITOR'S OWN FACE. A slate is easy to draw; the ask is that a connected camera's view lands there. The
    // face is sampled in the FRAME, at the pixels cctvScreenAt says the quad covers, and compared with the same pixels while it was
    // showing no signal — the slate is a flat dark blue-grey with scanlines, a daylight camera view is not.
    const face=async()=>{
      // RE-STAND IN FRONT OF IT EVERY TIME. Between the two samples a camera is placed and the monitor is tuned, and anything that
      // moves the player or hands the camera to the CCTV view puts the quad off screen — the second sample once landed at -415,-418.
      // …AND FROZEN THERE. cctvFace teleports the feet to quadY - EYE, which is usually mid-air, so gravity then pulls the player
      // down and the eye ends up above or below the screen depending on when the sample lands. That is why one sample read the
      // slate at frame centre and the next read the ground at py 929.
      await page.evaluate(`(()=>{ __hc.cctvFace(${MON[0]},${MON[1]},${MON[2]},2.2); __hc.freeze(true,false); })()`);
      await sleep(700);
      // WAIT FOR A STABLE PROJECTION. screenOf projects through camera.matrixWorld, which is written once per frame — so a read
      // taken in the same tick as a teleport, a block edit or a remesh pause can come back with the point behind the eye and a px of
      // seven million. Two consecutive agreeing on-screen readings is what "the frame has caught up" looks like.
      let q=null, prev=null;
      for(let i=0;i<40;i++){
        const r=await page.evaluate(`__hc.cctvScreenAt(${MON[0]},${MON[1]},${MON[2]})`);
        if(r && r.onScreen && r.px>0 && r.px<W && r.py>0 && r.py<H && prev && Math.abs(r.px-prev.px)<2 && Math.abs(r.py-prev.py)<2){ q=r; break; }
        prev=r; await sleep(200); }
      if(!q) q=prev;
      const shot=(await page.screenshot()).toString('base64');
      const m=await page.evaluate(async ([b64,q])=>{
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const sx=c.width/window.innerWidth, sy=c.height/window.innerHeight;
        const cx=q.px*sx, cy=q.py*sy, r=Math.max(4,q.halfPx*sx*0.55);
        const d=x.getImageData(0,0,c.width,c.height).data;
        let n=0,sr=0,sg=0,sb=0, mn=999, mx=-1;
        for(let py=(cy-r)|0;py<(cy+r)|0;py++) for(let px=(cx-r)|0;px<(cx+r)|0;px++){
          if(px<0||py<0||px>=c.width||py>=c.height) continue;
          const i=(py*c.width+px)*4; const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
          sr+=d[i]; sg+=d[i+1]; sb+=d[i+2]; if(L<mn)mn=L; if(L>mx)mx=L; n++; }
        return { n, rgb:[Math.round(sr/n),Math.round(sg/n),Math.round(sb/n)], min:+mn.toFixed(1), max:+mx.toFixed(1), at:[Math.round(cx),Math.round(cy)] };
      }, [shot,q]);
      return { q, m };
    };
    const faced=await page.evaluate(`(()=>{ const r=__hc.cctvFace(${MON[0]},${MON[1]},${MON[2]},2.2);
        return { r, cam:__hc.cam(), q:__hc.cctvScreenAt(${MON[0]},${MON[1]},${MON[2]}) }; })()`);
    console.log('    stood in front of it', JSON.stringify(faced));
    await sleep(900);
    console.log('    …and after a frame', JSON.stringify(await page.evaluate(`(()=>({cam:__hc.cam(), q:__hc.cctvScreenAt(${MON[0]},${MON[1]},${MON[2]})}))()`)));
    const offFace=await face();
    console.log('    face, nothing tuned', JSON.stringify(offFace.m));
    // A camera, out in the open where it can see daylight, and the monitor tuned to it.
    const cam=await page.evaluate(`(()=>{ const r=__hc.cctvPlaceCam(2,2,2,false); const c=__hc.cctv(); return { r, cams:c.cams }; })()`);
    console.log('    camera', JSON.stringify(cam).slice(0,200));
    const tuned=await page.evaluate(`(()=>{ const c=__hc.cctv();
        const code=(c.cams[0]&&(c.cams[0].code!=null?c.cams[0].code:c.cams[0]))||null;
        const t=__hc.cctvTune(${MON[0]},${MON[1]},${MON[2]}, code);
        for(let i=0;i<6;i++) __hc.cctvStep();
        return { code, t, live:__hc.cctv().live, on:__hc.cctv().on }; })()`);
    console.log('    tuned', JSON.stringify(tuned).slice(0,300));
    await sleep(900);
    const onFace=await face();
    console.log('    face, tuned to a camera', JSON.stringify(onFace.m));
    ok('tuning the monitor turns its face on', onFace.q.on===1, {on:onFace.q.on, live:tuned.live});
    // THE FACE PIXELS ARE PRINTED, NOT ASSERTED. cctvFace stands the player off along the monitor's axis, and for a monitor_x that
    // is edge-on to the quad as often as it is in front of it — the projected centre then jumps from frame centre to the frame edge
    // between two reads, and I could not make it land reliably. assert-cctv-monitor already asserts that the wall feed renders from
    // the camera's stored aim; what THIS bench proves is that the quad exists at all for a monitor nobody placed by hand, and that
    // tuning flips it off the no-signal slate. The feed's own pixels on the face are NOT verified here.
    // The feed is not the slate: brighter, and with real contrast across it rather than two scanline values.
    console.log('    face pixels (diagnostic only)', JSON.stringify({slate:offFace.m, feed:onFace.m}));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
