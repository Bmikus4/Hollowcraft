// THE TUNING HARNESS, opened for the first time — then three frames of the creature bracketing "slab" to "legible".
//
// Two jobs, in order, because the second depends on the first: confirm src/entity/drift/demo/harness.html actually loads
// (it had never been run, and it is the tool the tuning depends on), then shoot the bracket for Ben to pick from.
//
// The brackets move feed and blockMix TOGETHER because they fight each other: feed is how much of the clean render is
// blended in per step (higher = shorter memory = more anatomy), blockMix is how hard the history snaps to the latent grid
// (higher = more of the features eaten). Sweeping one alone would not span the range.
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

// slab -> legible. The middle one is not a midpoint of the numbers, it is the setting where the body should just resolve.
const BRACKET = [
  { tag:'A-slab',    feed:0.13, blockMix:0.55, note:'shipped default' },
  { tag:'B-middle',  feed:0.25, blockMix:0.32, note:'body should just resolve' },
  { tag:'C-legible', feed:0.42, blockMix:0.15, note:'clearly a creature, still drifting' },
];

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const ctx=await browser.newContext({viewport:{width:1100,height:760}});

    // ---- 1. DOES THE HARNESS PAGE LOAD AT ALL?
    const hp=await ctx.newPage();
    const hErrs=[];
    hp.on('pageerror',e=>hErrs.push(String(e.message||e)));
    hp.on('requestfailed',r=>hErrs.push('REQFAILED '+r.url().replace(base,'')));
    hp.on('response',r=>{ if(r.status()>=400) hErrs.push('HTTP '+r.status()+' '+r.url().replace(base,'')); });
    await hp.goto(base+'/src/entity/drift/demo/harness.html',{waitUntil:'load',timeout:60000});
    await sleep(3500);
    const hState=await hp.evaluate(`(()=>{ const c=document.querySelector('canvas'), s=document.getElementById('stat');
      return { canvas:!!c, w:c?c.width:0, h:c?c.height:0, sliders:document.querySelectorAll('#knobs input').length,
               stat:(s&&s.textContent||'').replace(/\\n/g,' | ').slice(0,160) }; })()`);
    console.log('HARNESS load: '+JSON.stringify(hState));
    console.log('HARNESS errors: '+(hErrs.length?JSON.stringify(hErrs.slice(0,4)):'none'));
    await hp.screenshot({ path: path.join(OUT,'drift-harness.png') });
    const harnessOk = hState.canvas && hState.w>0 && hState.sliders>0 && /steps \d/.test(hState.stat) && hErrs.length===0;
    console.log('HARNESS ok: '+harnessOk);
    await hp.close();

    // ---- 2. THE BRACKET, shot in the real game so Ben judges it in the place it will be seen.
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('PAGEERROR: '+String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true)`);
    // Full daylight, found not assumed — setTime returns the PREVIOUS frame's uDay, so read it a frame later.
    let best={f:0.15,day:-1};
    for(const f of [0,0.15,0.25,0.35]){ await page.evaluate(`__hc.setTime(${f})`); await sleep(400);
      const d=await page.evaluate(`__hc.st().day`); if(d>best.day) best={f,day:d}; }
    await page.evaluate(`__hc.setTime(${best.f})`);
    console.log('clock: '+JSON.stringify(best));
    await page.evaluate(`__hc.hwHold(true)`);          // frozen, or it captures the camera in about three seconds
    await page.evaluate(`__hc.hw(8)`);
    await sleep(1200);
    await page.evaluate(`(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      __hc.cam({ yaw:Math.atan2(-(w.x-p.x), -(w.z-p.z)), pitch:-0.02 }); })()`);

    for(const b of BRACKET){
      await page.evaluate(`__hc.hwTune('feed',${b.feed}); __hc.hwTune('blockMix',${b.blockMix})`);
      await sleep(2600);                               // the loop's history has to converge on the new setting
      const pr=(await page.evaluate(`__hc.hwProbe()`))[0];
      const fr=(await page.evaluate(`__hc.hwFraming()`))[0];
      await page.screenshot({ path: path.join(OUT,'drift-'+b.tag+'.png') });
      await page.screenshot({ path: path.join(OUT,'drift-'+b.tag+'-crop.png'), clip:{x:390,y:150,width:420,height:460} });
      console.log(b.tag+'  feed='+b.feed+' blockMix='+b.blockMix+'  ('+b.note+')  '
        + JSON.stringify({ outLuma:pr.out.luma, coverPct:fr.coverPct, boxW:fr.boxW, boxH:fr.boxH }));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
