// THE EYE GLOW. The claim is not "the eyes look red" — it is that NEARBY SURFACES take red light from them. So the numbers
// here come off the reserved pool light and off the terrain's own lighting, and the proof is a night frame with the
// creature close to the ground and a wall.
//
// Cost is measured A/B: the same scene with the glow forced off, then on, both with the creature filling the view.
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
    page.on('pageerror',e=>console.log('PAGEERROR: '+String(e.stack||e.message||e).slice(0,600)));
    await page.goto(base+'/index.html?debug=1&perf=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true)`);
    await sleep(1200);

    const face = `(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      __hc.cam({ yaw:Math.atan2(-(w.x-p.x), -(w.z-p.z)), pitch:-0.02 }); return w; })()`;

    // The reserved pool slot, read through the existing owShadow hook, which already reports every lit pool light.
    // castShadow is reported because a LIT shadow-casting point light re-renders six cube faces of the whole scene every
    // frame, which is worth several milliseconds — the first hypothesis for a 6ms A/B on one light.
    const lightState = `(()=>{ const s=__hc.owShadow(); const lit=(s.pool||[]).filter(p=>p.i>0);
      return { litPoolLights:lit.length, casters:s.casters, tier:s.tier,
               lights:lit.map(p=>({i:p.i, d:p.d, y:p.y, cast:p.cast})) }; })()`;

    // 'spill' is the proof frame: night, close enough that the ground and whatever it stands beside are inside the light's
    // reach. A 6-block frame showed the eyes fine and stained nothing, which is what a head-mounted light with too short a
    // range looks like — the eyes are not the deliverable, the surfaces are.
    for(const [name,frac,dist] of [['spill',0.72,3.2],['night',0.72,6],['noon',0.15,6]]){
      await page.evaluate(`__hc.setTime(${frac})`); await sleep(900);
      await page.evaluate(`__hc.hwKill()`); await sleep(300);
      await page.evaluate(`__hc.hwHold(true)`); await page.evaluate(`__hc.hw(${dist})`); await sleep(1500);
      // spawnHorrific clamps spawn distance to >=10, so walk the PLAYER in to get a genuinely close frame.
      if(dist<10){ await page.evaluate(`(()=>{ const w=__hc.hwState()[0];
        const a=Math.random()*6.283; __hc.tp(w.x+Math.cos(a)*${dist}, w.y+1, w.z+Math.sin(a)*${dist}); })()`); await sleep(900); }
      await page.evaluate(face); await sleep(1800);
      console.log(name+' light  '+JSON.stringify(await page.evaluate(lightState)));
      console.log(name+' day '+await page.evaluate(`__hc.st().day`));
      // A/B FROM THE IDENTICAL CAMERA. A single frame with warm ground cannot prove the light did it — dirt and path blocks
      // are warm too. With the glow switched off and nothing else touched, whatever changes IS the spill.
      for(const on of [1,0]){
        await page.evaluate(`__hc.hwGlow(${on?'true':'false'})`);
        await sleep(700);
        await page.screenshot({ path: path.join(OUT,'glow-'+name+(on?'-ON':'-OFF')+'.png') });
        await page.screenshot({ path: path.join(OUT,'glow-'+name+(on?'-ON':'-OFF')+'-crop.png'), clip:{x:400,y:110,width:480,height:520} });
      }
      await page.evaluate(`__hc.hwGlow(true)`);
    }

    // MOVING: release the AI so it walks, and shoot mid-stride so the trail reads as a trail and not a smear.
    await page.evaluate(`__hc.setTime(0.72)`); await sleep(600);
    await page.evaluate(`__hc.hwHold(false)`);
    for(let k=0;k<12;k++){ const w=(await page.evaluate(`__hc.hwState()`))[0];
      if(w && w.dist<14 && w.dist>5){ break; } await sleep(500); }
    await page.evaluate(face); await sleep(200);
    await page.screenshot({ path: path.join(OUT,'glow-moving.png') });
    await page.screenshot({ path: path.join(OUT,'glow-moving-crop.png'), clip:{x:400,y:110,width:480,height:520} });
    await page.evaluate(`__hc.hwHold(true)`);

    // COST A/B, creature filling the view, glow off then on. Off = park the reserved light and hide the trail sprites,
    // which is exactly what hwGlowStep does when no instance qualifies.
    const prof = async(label)=>{ await sleep(2600); const p=await page.evaluate(`__hc.frameProf(150)`);
      console.log(label+'  '+JSON.stringify({ avgFrameMs:p.avgFrameMs, drift:p.ms&&p.ms.drift, draw:p.ms&&p.ms.draw, hud:p.ms&&p.ms.hud }));
      return p.avgFrameMs; };
    // OFF / ON / OFF from a FIXED camera with the AI held. A single on-then-off pair cannot tell the glow's cost apart
    // from the creature having walked closer between the two samples, which is how the first run of this reported 6.2ms.
    await page.evaluate(face); await sleep(400);
    await page.evaluate(`__hc.hwGlow(false)`); const off1 = await prof('cost OFF #1');
    await page.evaluate(`__hc.hwGlow(true)`);  const onMs = await prof('cost ON    ');
    await page.evaluate(`__hc.hwGlow(false)`); const off2 = await prof('cost OFF #2');
    await page.evaluate(`__hc.hwGlow(true)`);
    const offMs = (off1+off2)/2;
    console.log('GLOW COST: '+(onMs-offMs).toFixed(3)+' ms/frame  (on '+onMs.toFixed(2)+' vs off '+off1.toFixed(2)+'/'+off2.toFixed(2)+')');
    console.log('  off-to-off spread '+Math.abs(off1-off2).toFixed(2)+'ms — if that is near the glow figure, the measurement is noise');

    // AFTER THE CREATURE IS GONE, nothing of its glow may remain. The drift/glow step only runs while an instance exists, so
    // removing the last one could strand the eye light lit and the eye sprites floating in the world with nothing behind
    // them; and the reserved pool slot must return to the torches rather than being held for the session.
    await page.evaluate(`__hc.hwKill()`);
    await sleep(900);
    const after = await page.evaluate(`(()=>{ const s=__hc.owShadow();
      const eye=(s.pool||[]).filter(p=>p.i>0 && Math.abs(p.d-11)<0.01);
      return { strandedEyeLights:eye.length, litPool:(s.pool||[]).filter(p=>p.i>0).length }; })()`);
    console.log('after kill  '+JSON.stringify(after));
    if(after.strandedEyeLights!==0) console.log('FAIL: the eye light is still lit with no creature alive');
    else console.log('PASS: no eye light left behind');

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
