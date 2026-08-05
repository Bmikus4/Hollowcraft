// A FIREFLY LIGHTS WHAT IT IS SITTING ON (Ben 08-05: "fireflies should be a real glowing light source at night, albeit small").
// They were additive sprites: a glow ON the screen that lit nothing, so the leaf under one stayed as black as the rest of the wood.
// The nearest two now ride the GLOW POOL — resident lights, nearest candidate wins, nothing created — while their blink is bright.
// Measured as a pixel A/B against __hc.ffTune({light:false}), which is the old behaviour exactly, with the insect PINNED: an
// unpinned one drifts and blinks and the pair would measure its wander instead of its light.
//   node bench/assert-firefly-light.mjs
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
    // ?t is worldTime in SECONDS of a 840 s cycle, not a fraction: t=0 is dawn-ish and read uDay 0.522, which is daylight and no
    // swarm at all. Night is clock 0.63..0.94, so 660 s is the middle of it.
    await page.goto(base+'/index.html?debug=1&t=660',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1500);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); })()`); await sleep(1500);
    const ff=await page.evaluate(`__hc.fireflies()`);
    console.log('    swarm', JSON.stringify(ff));
    ok('it is night and there is a swarm', ff.built===true && ff.live>0, ff);
    // A wall of stone right in front of the eye, and the firefly between the two. Stone, not the ground, because the ground is
    // lit by the moon and a wall face turned away from it is the darkest surface a bench can point at.
    const set=await page.evaluate(`(()=>{ const p=__hc.probe();
        for(let dy=-1;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) __hc.setBlock(dx,dy,-3,'stone');
        __hc.cam({yaw:0,pitch:0});
        return { at:[p.x,p.y,p.z] }; })()`);
    await sleep(900);
    const pin=await page.evaluate(`(()=>{ const p=__hc.probe();
        // 1.2 blocks in front of the wall face, at eye height, slightly off centre so its own sprite is not over the sample crop.
        return __hc.ffTune({light:true, pin:[Math.floor(p.x)+0.5, p.y+0.4, Math.floor(p.z)-1.7]}); })()`);
    console.log('    pinned', JSON.stringify(pin).slice(0,300));
    await sleep(800);
    const look=async()=>{
      const shot=(await page.screenshot()).toString('base64');
      return await page.evaluate(async (b64)=>{
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data;
        // A ring 40-90 px out from centre: the sprite itself is a few px at the middle, so this samples the WALL around it and
        // not the glow of the insect. That distinction is the whole test — an additive sprite would brighten the middle only.
        let n=0,s=0;
        const cx=c.width/2, cy=c.height/2;
        for(let py=(cy-90)|0; py<(cy+90)|0; py++) for(let px=(cx-90)|0; px<(cx+90)|0; px++){
          const r=Math.hypot(px-cx,py-cy); if(r<40||r>90) continue;
          const i=(py*c.width+px)*4; s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; n++; }
        return { lum:+(s/n).toFixed(3), px:n };
      }, shot);
    };
    const on=await look();
    const st=await page.evaluate(`__hc.ffTune({light:false})`); await sleep(700);
    const offL=await look();
    await page.evaluate(`__hc.ffTune({light:true})`); await sleep(700);
    const on2=await look();
    console.log('    wall luminance', JSON.stringify({withLight:on.lum, spritesOnly:offL.lum, again:on2.lum, px:on.px}));
    const tune=await page.evaluate(`__hc.ffTune()`);
    console.log('    glow pool', JSON.stringify(tune.glowPool), 'litLights', tune.litLights);
    ok('the pinned firefly is holding a glow-pool slot', tune.litLights>=1, {litLights:tune.litLights, max:tune.max});
    ok('…and that slot is the small green one, not a torch', (tune.glowPool||[]).some(L=>L.i>0.1 && L.d<5 && L.c!=='ff8626'), tune.glowPool);
    // The light is deliberately small, so this is a few luminance levels on a black wall, not a floodlit room.
    ok('the wall is brighter with the light than with the sprites alone', on.lum-offL.lum > 0.5, {withLight:on.lum, spritesOnly:offL.lum, delta:+(on.lum-offL.lum).toFixed(3)});
    ok('…and it comes back when the light does (so the pair is the light, not the night moving on)', Math.abs(on2.lum-on.lum) < Math.abs(on.lum-offL.lum), {on:on.lum, off:offL.lum, on2:on2.lum});
    ok('never more than two of the three glow slots', tune.max===2, {max:tune.max});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
