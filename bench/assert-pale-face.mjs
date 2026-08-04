// THE PALE'S FACE, HANDS AND TORSO, AS BEN ASKED FOR THEM.
//
//   "remove the pales red lips, and move its mouth slit down to the bottom 1/5th of its head. its head should open all
//    the time too" · "make its body more torso like, not just a rectangular blob. Make him look emaciated" · "its hands
//    should be rotated palms facing inward" · "its tounge should ONLY be out when its mouth is open, and its tounge needs
//    to be positioned in th eback of its throat"
//
// Read off the live mesh through __hcBRX.paleProbe, per clip, because two of these are animation-dependent: the jaw must be
// ajar in the RESTING clips and the tongue must be absent in exactly those clips and present in the violent ones. A check
// on the constants alone would pass on a build where the animation never applies them.
//
//   node bench/assert-pale-face.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    const which = await page.evaluate(`(()=>{ for(const k of ['__hcBRX','__hcBR']) if(window[k]&&typeof window[k].paleProbe==='function') return k; return null; })()`);
    if(!which){ console.log('  paleProbe is not exposed — cannot verify'); process.exit(1); }
    await page.evaluate(`window.PQA=window[${JSON.stringify(which)}]`);

    // POLL FOR THE GAPE TO SETTLE, don't sleep a guessed interval: the jaw eases toward its resting angle, and the first
    // pose of a run starts from a shut mouth, so a 1.4 s window caught it at 0.201 on its way to 0.32 and read as a fail.
    const pose = async (a) => { await page.evaluate(`PQA.anim(${JSON.stringify(a)})`);
      let last=null; for(let i=0;i<24;i++){ await sleep(250); const g=await page.evaluate(`(PQA.paleProbe()||{}).gape`);
        if(last!=null && Math.abs(g-last)<0.002) break; last=g; }
      return page.evaluate(`PQA.paleProbe()`); };
    const idle = await pose('idle');
    if(idle.err){ console.log('  '+idle.err); process.exit(1); }
    console.log('  idle: '+JSON.stringify(idle));

    check('the mouth slit sits in the bottom fifth of the head', idle.splitFrac!=null && idle.splitFrac<=0.24 && idle.splitFrac>0.15, `jaw is ${idle.splitFrac} of the head`);
    check('the head is open while it merely stands there',       idle.gape>0.25 && idle.cranRx<-0.3, `gape ${idle.gape}, cranium ${idle.cranRx} rad`);
    check('no bright red inside the head (the "lips")',          !idle.brightRedInHead, `found ${idle.brightRedInHead}`);
    check('the tongue is NOT out at rest',                       idle.tongueVisible===false, `visible ${idle.tongueVisible}`);
    check('the tongue is rooted BEHIND the face',                idle.tongueRootZ<0, `root z ${idle.tongueRootZ}`);
    check('the torso is built from many volumes, not one box',   idle.torsoBoxes>=10, `${idle.torsoBoxes} boxes on the spine`);
    check('the waist is far narrower than the chest',            idle.waistW!=null && idle.waistW < idle.chestW*0.6, `waist ${idle.waistW} against chest ${idle.chestW}`);
    check('both palms are turned a quarter turn inward',         Math.abs(Math.abs(idle.palmYawL)-1.571)<0.01 && Math.abs(Math.abs(idle.palmYawR)-1.571)<0.01, `L ${idle.palmYawL}, R ${idle.palmYawR}`);
    check('and they turn OPPOSITE ways, i.e. both inward',       idle.palmYawL*idle.palmYawR<0, `L ${idle.palmYawL}, R ${idle.palmYawR}`);

    // the other half of "only when its mouth is open": it must actually appear when the mouth goes wide
    const flail = await pose('flail');
    console.log('  flail: '+JSON.stringify({gape:flail.gape, cranRx:flail.cranRx, tongue:flail.tongueVisible}));
    check('the mouth goes wide in the flail',                    flail.gape>0.9, `gape ${flail.gape}`);
    check('and THEN the tongue is out',                          flail.tongueVisible===true, `visible ${flail.tongueVisible}`);
    const back = await pose('stand');
    check('it goes back in when the clip calms',                 back.tongueVisible===false, `gape ${back.gape}, visible ${back.tongueVisible}`);
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
