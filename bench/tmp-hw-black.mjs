// THE BLACK SKIN, checked where it can fail. A near-black creature that vanishes against night or the Backrooms' dark is
// absent, not frightening, so this shoots it at full daylight, at night and inside the halls, and reports the mean luma of
// the loop's output next to the mean luma of the frame AROUND it. Contrast against the background is the number that
// decides whether a silhouette resolves; the creature's own brightness alone says nothing.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
const OUT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f17fe305-bd3b-4b89-81c6-34ea30e4177c/scratchpad';
fs.mkdirSync(OUT,{recursive:true});
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR: '+String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&perf=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true)`);
    await sleep(1200);

    // NO on-canvas contrast metric. Reading the game's WebGL canvas back with drawImage returns a blank image unless the
    // renderer was built with preserveDrawingBuffer, so an earlier version of this check reported body 0 / around 0 /
    // contrast 0 in every scene — a number that would have "proved" the creature invisible whatever it looked like.
    // Adding that flag to the real renderer to satisfy a test is not worth it, so the crops get judged by eye and the only
    // numbers reported here are ones that come from the loop's own render target.
    const face = `(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      __hc.cam({ yaw:Math.atan2(-(w.x-p.x), -(w.z-p.z)), pitch:-0.02 }); return w; })()`;

    const scenes = [];
    for(const [name, frac] of [['noon', null], ['night', 0.72]]){
      if(frac==null){ let best={f:0.15,day:-1};
        for(const f of [0,0.15,0.25,0.35]){ await page.evaluate(`__hc.setTime(${f})`); await sleep(400);
          const d=await page.evaluate(`__hc.st().day`); if(d>best.day) best={f,day:d}; }
        await page.evaluate(`__hc.setTime(${best.f})`); }
      else await page.evaluate(`__hc.setTime(${frac})`);
      await sleep(900);
      await page.evaluate(`__hc.hwKill()`); await sleep(300);
      await page.evaluate(`__hc.hwHold(true)`); await page.evaluate(`__hc.hw(9)`); await sleep(1400);
      await page.evaluate(face); await sleep(2400);
      const day = await page.evaluate(`__hc.st().day`);
      const pr = (await page.evaluate(`__hc.hwProbe()`))[0];
      const fr = (await page.evaluate(`__hc.hwFraming()`))[0];
      await page.screenshot({ path: path.join(OUT,'black-'+name+'.png') });
      await page.screenshot({ path: path.join(OUT,'black-'+name+'-crop.png'), clip:{x:440,y:130,width:400,height:460} });
      scenes.push({ name, day, loopLuma:pr.out.luma, coverPct:fr.coverPct, boxW:fr.boxW, boxH:fr.boxH });
      console.log(name+'  '+JSON.stringify(scenes[scenes.length-1]));
    }

    // UNDERWATER. Reported as "it doesn't like to render underwater": the chunk water meshes are renderOrder 3 and so was
    // the billboard, so three fell back to depth sorting between two transparents and the water won. The billboard is 5
    // now. Put the eye UNDER the surface with the creature up the beach and photograph it — the failure was in compositing,
    // which the loop's own render target cannot see, so this has to be judged on the frame.
    await page.evaluate(`__hc.setTime(0.15)`); await sleep(700);
    const uw = await page.evaluate(`(()=>{ const sea=__hc.island().sea, p=__hc.pos();
      for(let r=8;r<200;r+=2) for(const a of [0,1.57,3.14,4.71,0.78,2.36,3.93,5.5]){
        const x=Math.round(p.x+Math.cos(a)*r), z=Math.round(p.z+Math.sin(a)*r);
        if(__hc.surfH(x,z) <= sea-3){ __hc.tp(x, sea-1, z); return { x, z, sea, eyeY:sea-1 }; } }
      return null; })()`);
    console.log('underwater spot  '+JSON.stringify(uw));
    if(uw){
      await sleep(1200);
      await page.evaluate(`__hc.hwKill()`); await sleep(300);
      await page.evaluate(`__hc.hwHold(true)`); await page.evaluate(`__hc.hw(9)`); await sleep(1500);
      await page.evaluate(face); await sleep(2400);
      const pr=(await page.evaluate(`__hc.hwProbe()`))[0];
      console.log('underwater  '+JSON.stringify({ eye:await page.evaluate(`__hc.pos().y`), loopLuma:pr.out.luma,
        submerged:await page.evaluate(`(()=>{ const e=document.getElementById('water'); return e?+(getComputedStyle(e).opacity):null; })()`) }));
      await page.screenshot({ path: path.join(OUT,'black-underwater.png') });
      await page.screenshot({ path: path.join(OUT,'black-underwater-crop.png'), clip:{x:440,y:130,width:400,height:460} });
    }

    // Scale + resolution, stated rather than assumed.
    console.log('rig  '+JSON.stringify(await page.evaluate(`(()=>{ const w=__hc.hwState()[0];
      return { span:w.drift.span, res:w.drift.res, hz:w.drift.hz }; })()`)));
    const prof = await page.evaluate(`__hc.frameProf(150)`);
    console.log('cost  '+JSON.stringify({ avgFrameMs:prof.avgFrameMs, drift:prof.ms&&prof.ms.drift }));

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
