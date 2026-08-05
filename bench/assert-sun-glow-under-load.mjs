// THE SUN KEEPS ITS GLOW UNDER LOAD (Ben 08-05: "the sun loses its glow sometimes").
// The wide glow around the sun IS the bloom pass spreading the sky shader's disc, and adaptive quality used to shed bloom as its
// last resort — so on a machine that dips below the shed threshold the sun's glow went out, on a 1.2 s tick, and stayed out until
// the framerate cleared the higher restore threshold. Drives the whole ladder with __hc.fpsPin and measures the glow itself: the
// mean luminance of an annulus 3-10 degrees off the sun, which is where the halo lives and where the disc is not.
//   node bench/assert-sun-glow-under-load.mjs
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
const W=1000,H=600;
// The glow: mean luminance of the ring 3-10 deg off the sun's screen position, measured off a real screenshot because the glow is
// added by a post pass and exists nowhere in the scene graph.
async function glow(page){
  const shot=(await page.screenshot()).toString('base64');
  return await page.evaluate(async (b64)=>{
    const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
    const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
    const x=c.getContext('2d'); x.drawImage(im,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data;
    const s=__hc.sunDisc();                                  // ndc of the sun + the state of the disc overlay
    const nd=s.ndc||[0,0];
    const cx=(nd[0]*0.5+0.5)*c.width, cy=(0.5-nd[1]*0.5)*c.height;
    const pxPerDeg=(c.height/2)/ (Math.atan(Math.tan(s.fovRad? s.fovRad/2 : 0.54))*57.29578);
    const r0=3*pxPerDeg, r1=10*pxPerDeg;
    let n=0, sum=0;
    for(let py=Math.max(0,(cy-r1)|0); py<Math.min(c.height,(cy+r1)|0); py++)
      for(let px=Math.max(0,(cx-r1)|0); px<Math.min(c.width,(cx+r1)|0); px++){
        const rr=Math.hypot(px-cx,py-cy); if(rr<r0||rr>r1) continue;
        const i=(py*c.width+px)*4; sum+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; n++; }
    return { glow:n?+(sum/n).toFixed(2):null, px:n, at:[Math.round(cx),Math.round(cy)], sun:s };
  }, shot);
}
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
    // RE-AIMED BEFORE EVERY READ. Time keeps running while the ladder is being driven, so the sun walks across the sky: the
    // first run of this measured the halo at [722,200] and then at [262,156] and called the difference a lost glow. The halo's
    // brightness depends on where in the frame it sits (it is a post-pass spread, and the frame edge clips it), so the only
    // comparable measurement is one taken with the sun in the same place — the middle.
    // Pitch is POSITIVE upward here — the sign the other way left the sun at ndc.y 0.80, clipped against the top of the frame,
    // and an annulus half off the screen is not a halo measurement. Two passes, because the sun moves while the first settles.
    const aimSun=async()=>{ let a=null;
      for(let i=0;i<4;i++){ a=await page.evaluate(`(()=>{ const s=__hc.sunDisc(); const d=s.dir; if(!d) return null;
          __hc.cam({yaw:Math.atan2(-d[0],-d[2]), pitch:Math.asin(Math.max(-1,Math.min(1,d[1])))}); return __hc.sunDisc().ndc; })()`);
        await sleep(700); }
      return a; };
    console.log('    aimed at the sun', JSON.stringify(await aimSun()));
    const before=await page.evaluate(`__hc.fpsPin()`);
    console.log('    state', JSON.stringify(before));
    const g0=await glow(page); console.log('    glow, healthy fps', JSON.stringify({glow:g0.glow, px:g0.px, at:g0.at}));
    ok('the sun is on screen and the annulus has pixels in it', g0.px>500 && g0.glow!=null, {px:g0.px, glow:g0.glow});
    ok('…and it is near the middle of the frame, where the halo is not clipped', Math.hypot(...(g0.sun.ndc||[9,9]))<0.25, {ndc:g0.sun.ndc});
    // 20 fps, and wait for the ladder to run out of steps. It takes ONE step per 75-frame tick — five or six to walk the internal
    // resolution down to 0.5, three more for the shadow cadence, then god rays — and a headless frame is slow, so 75 frames can be
    // two and a half seconds. The first version of this waited 12 s and caught the ladder mid-descent.
    await page.evaluate(`__hc.fpsPin(20)`);
    for(let i=0;i<30;i++){ await sleep(1500);
      const st=await page.evaluate(`__hc.fpsPin()`);
      if(!st.godrays && st.pixelScale<=0.5 && st.shadowEvery>=6){ console.log('    shed out at tick ~'+i, JSON.stringify(st)); break; }
      if(i===29) console.log('    ladder still descending after 45 s', JSON.stringify(st)); }
    const st=await page.evaluate(`__hc.fpsPin()`);
    ok('the ladder really did shed: internal resolution down', st.pixelScale<=0.62, {pixelScale:st.pixelScale});
    ok('…and shadow cadence, and god rays', st.shadowEvery>=5 && st.godrays===false, {shadowEvery:st.shadowEvery, godrays:st.godrays});
    ok('BLOOM SURVIVED THE WHOLE LADDER', st.bloom===true, st);
    console.log('    re-aimed', JSON.stringify(await aimSun()));
    const g1=await glow(page); console.log('    glow, pinned 20 fps', JSON.stringify({glow:g1.glow, px:g1.px, at:g1.at}));
    // The glow may dim a little — half internal resolution changes the disc's footprint — but it must not go out. Shedding bloom
    // took it to the flat sky value; keeping it leaves the halo plainly brighter than that.
    ok('the glow is still there under load', g1.glow > g0.glow*0.75, {before:g0.glow, under:g1.glow});
    await page.evaluate(`__hc.fpsPin(null)`);
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
