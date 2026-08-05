// A CREATURE IS JOINED TO THE GROUND IT STANDS ON, FOR ONE DRAW CALL.
//
// Plan §4 item 11. Creatures cast shadow-map shadows only, and only inside the 46-block frustum, so beyond that a deer stands on a
// hillside with nothing under it and reads as a sticker. What sells contact is the small dark patch at the feet, and that needs no
// shadow map: an animal's own `y` IS the ground it stands on (spawnAnimal and the walk code both set it from groundYAt), so the
// shadow goes at its feet by definition — no raycast, no height lookup, and one InstancedMesh for every creature on screen.
//
// THREE CLAIMS: the ground under a creature darkens; ground with no creature on it does not; and the whole thing is one draw call,
// because draws are the resource this frame is short of (805 at the shore).
//
// The creature is spawned with the game's own /spawn, and its screen position comes from __hc.screenOf on its live coordinates —
// never from a guessed crop, since an animal walks off while the harness is measuring.
//
//   node bench/assert-contact-shadows.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function box(file,px,py,rad){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,(px-rad)|0), x1=Math.min(P.w,(px+rad)|0), y0=Math.max(0,(py-rad)|0), y1=Math.min(P.h,(py+rad)|0);
  let s=0,n=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
  return n?+(s/n).toFixed(3):null;
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const C0=await page.evaluate(`__hc.contactShadows()`);
    console.log(`  ${JSON.stringify(C0)}`);
    check('contact shadows are on by default', C0.on===true, JSON.stringify(C0));
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // A CLEAR PATCH OF GROUND. The creature is put on it with the game's own /spawn, and the crop follows the creature's own live
    // position — an animal wanders, so a crop fixed in advance measures whatever it walked away from.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+3.0, ${S.sz}+9.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await page.evaluate(`__hc.cmdRun('/spawn deer')`); await sleep(900);
    // FREEZE THE SIM. Animals flee the player, so teleporting next to one to photograph its shadow scares it out of frame before the
    // aim finishes — three attempts framed nothing at all. __hc.freezeAnimals leaves every mesh where it stands.
    console.log(`  ${JSON.stringify(await page.evaluate(`__hc.freezeAnimals(true)`))}`);
    const who=await page.evaluate(`(()=>{ const c=__hc.contactShadows(); return { live:c.live, animals:c.animals }; })()`);
    console.log(`  after /spawn: ${JSON.stringify(who)}`);
    check('a creature exists and carries a shadow instance', who.live>0, JSON.stringify(who));
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(450); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.42);   // full daylight, measured (setTime is a quarter turn off its own comment)
    // GO TO THE CREATURE, DO NOT HUNT FOR IT. Two earlier versions failed on the same thing: the darkest patch of ground in frame
    // was tree shade (1.19 luminance), and aiming at a reported instance from spawn framed animals 24 blocks away behind terrain,
    // where a 1-block shadow is a few pixels inside a 32-pixel box. The hook reports each instance's foot position, so the camera
    // is placed four blocks from one at eye height and aimed at it: the shadow then fills a known part of the frame.
    // A RING, not a box: the creature's own body sits over the middle of its shadow from any angle that can see the ground.
    const shot=async tag=>{ const f=path.join(OUT,`csh-${tag}.png`); await page.screenshot({path:f}); return f; };
    const ring=(file,px,py,rin,rout)=>{ const P=decodePNG(fs.readFileSync(file)); let s2=0,n2=0;
      const x0=Math.max(0,(px-rout)|0),x1=Math.min(P.w,(px+rout)|0),y0=Math.max(0,(py-rout)|0),y1=Math.min(P.h,(py+rout)|0);
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const r=Math.hypot(x-px,y-py); if(r<rin||r>rout) continue;
        s2+=lum(P.data,(y*P.w+x)*P.ch); n2++; }
      return n2?+(s2/n2).toFixed(3):null; };
    let best=null;
    const H=await page.evaluate(`__hc.contactShadows()`);
    for(const a of (H.at||[]).slice(0,6)){
      await page.evaluate(`__hc.tpAt((${a[0]})+3.2, (${a[1]})+2.0, (${a[2]})+3.2)`); await sleep(700);
      // aim with the game's own projection, so no yaw convention is assumed
      let bestYaw=null,bestR=1e9;
      for(let k=0;k<32;k++){ const yaw=k*Math.PI/16; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.62})`); await sleep(55);
        const p=await page.evaluate(`__hc.screenOf(${a[0]}, ${a[1]}, ${a[2]})`);
        if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-300); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
      if(bestYaw==null||bestR>200) continue;
      await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.62})`); await sleep(320); await pin(0.42);
      const p=await page.evaluate(`__hc.screenOf(${a[0]}, ${a[1]}, ${a[2]})`);
      if(!(p&&p.onScreen)) continue;
      // The animal may have wandered between the aim and the shot; the instance list is re-read and the shot only counts if a
      // shadow is still within a block of where this one was.
      // PARENTHESISE INTERPOLATED COORDINATES. A creature at z = -19.81 turned `A[i][2]-${'${a[2]}'}` into `A[i][2]--19.81`, which is a
      // decrement operator and a SyntaxError — the harness died on the third animal it looked at, having worked on the first two.
      const still=await page.evaluate(`(function(){ var c=__hc.contactShadows(), A=c.at||[];
        for(var i=0;i<A.length;i++){ if(Math.hypot(A[i][0]-(${a[0]}), A[i][2]-(${a[2]}))<1.0) return true; } return false; })()`);
      if(!still) continue;
      await page.evaluate(`__hc.contactShadows({on:true})`);  await sleep(300); const on =await shot('feet-on');
      await page.evaluate(`__hc.contactShadows({on:false})`); await sleep(300); const off=await shot('feet-off');
      await page.evaluate(`__hc.contactShadows({on:true})`);
      // A BOX AT THE FEET, radius 14. A ring of 10-52 px read 0.67 luminance of difference and looked like a feature that was not
      // drawing at all — six frames were spent on that — when the shadow was simply smaller than the ring: the same pair measured in
      // a 24-pixel box moved 2.8, and at 6x scale it moves 14.6. Measure the thing at the size it is.
      const b=box(on,p.px,p.py,14), c=box(off,p.px,p.py,14);
      console.log(`  feet ${a.slice(0,3)} r${a[3]} -> screen ${p.px|0},${p.py|0}: off ${c} -> on ${b}  (darker by ${(c-b).toFixed(2)})`);
      if(!best || (c-b)>best.delta) best={ delta:+(c-b).toFixed(2), off:c, on:b };
      if(best.delta>2.0) break;
    }
    check('the ground under a creature darkens', !!best && best.delta > 2.0, best?`off ${best.off} -> on ${best.on}, darker by ${best.delta}`:'no creature could be framed');
    // AND NOTHING ELSE DOES. The sky is the control: it has no ground and no creature, so a shadow that shows up there is a plane
    // being drawn in the wrong place — which is exactly what happens if the sky birds are ever fed into this.
    const SKY=[0.10,0.90,0.03,0.12];
    const skyMean=(f)=>{ const P=decodePNG(fs.readFileSync(f)); let s=0,n=0;
      for(let y=(P.h*SKY[2])|0;y<(P.h*SKY[3])|0;y++) for(let x=(P.w*SKY[0])|0;x<(P.w*SKY[1])|0;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
      return +(s/n).toFixed(3); };
    await page.evaluate(`__hc.cam({yaw:0, pitch:0.30})`); await sleep(250); await pin(0.42);   // pitched UP for the sky control
    await page.evaluate(`__hc.contactShadows({on:true})`);  await sleep(300); const sOn =await shot('sky-on');
    await page.evaluate(`__hc.contactShadows({on:false})`); await sleep(300); const sOff=await shot('sky-off');
    await page.evaluate(`__hc.contactShadows({on:true})`);
    console.log(`  sky band ${skyMean(sOff)} -> ${skyMean(sOn)}`);
    check('nothing is drawn in the sky', Math.abs(skyMean(sOn)-skyMean(sOff)) < 0.6, `${skyMean(sOff)} -> ${skyMean(sOn)}`);
    // ONE DRAW CALL, whatever the creature count.
    await page.evaluate(`__hc.contactShadows({on:false})`); await sleep(350); const dOff=await page.evaluate(`__hcBRX.drawProbe()`);
    await page.evaluate(`__hc.contactShadows({on:true})`);  await sleep(350); const dOn =await page.evaluate(`__hcBRX.drawProbe()`);
    const live=(await page.evaluate(`__hc.contactShadows()`)).live;
    console.log(`  draws ${dOff.calls} -> ${dOn.calls} for ${live} creatures`);
    check('one draw call for all of them', dOn.calls-dOff.calls<=1 && live>=1, `${dOff.calls} -> ${dOn.calls}, ${live} live`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/csh-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
