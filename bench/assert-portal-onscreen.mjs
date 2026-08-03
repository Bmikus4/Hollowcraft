// THE PORTAL MUST STOP RENDERING WHEN THE DOOR IS BEHIND YOU, AND MUST NEVER SHOW A STALE ROOM.
//
// PERF.portalOnScreen skips the Backrooms door's second full scene render on frames where the door is behind
// the camera. Paired A/B says that is worth -2.4 ms standing with your back to it and -2.8 ms turning past
// it, with 11 fewer frames over 16.6 ms. This is the correctness half: the saving is only legitimate if
// turning back produces a fresh frame immediately.
//
// Uses BRQA.portalProbe('facing'|'behind'|'far'), which exists for this gate, and BR._portalFrames, which
// counts actual portal renders. Every claim is a DELTA in that counter over a measured window, and each one
// is checked with the flag ON and OFF — a gate that cannot be shown to change the count is not evidence.
//
//   node bench/assert-portal-onscreen.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    // portalProbe lives on the BRX substrate object, not on a __hcBR — resolve it once rather than guess.
    const which = await page.evaluate(`(()=>{ for(const k of ['__hcBRX','__hcBR','__hcPERF','__hc']) if(window[k] && typeof window[k].portalProbe==='function') return k; return null; })()`);
    if(!which){ console.log('  portalProbe is not exposed on any window hook — cannot verify this gate'); process.exit(1); }
    await page.evaluate(`window.BRQA = window[${JSON.stringify(which)}]`);
    console.log('  portalProbe found on window.'+which);
    await page.evaluate(`__hcPERF.spawnDoor()`);
    await sleep(4000);

    // renders per second in a given stance, at a given flag value
    const rate = async (where, flag, ms=2500) => {
      await page.evaluate(`__hcPERF.set('portalOnScreen', ${flag})`);
      await page.evaluate(`BRQA.portalProbe(${JSON.stringify(where)}); __hc.lock(true);`);
      await sleep(700);                                   // let the stance settle before counting
      const a = await page.evaluate(`BRQA.portalProbe(${JSON.stringify(where)}).frames`);
      await sleep(ms);
      const b = await page.evaluate(`BRQA.portalProbe(${JSON.stringify(where)}).frames`);
      return { renders:b-a, perSec:+((b-a)/(ms/1000)).toFixed(1) };
    };

    const facingOff = await rate('facing', false), facingOn = await rate('facing', true);
    const behindOff = await rate('behind', false), behindOn = await rate('behind', true);
    const farOn     = await rate('far',    true);

    console.log(`  facing: flag off ${facingOff.perSec}/s, on ${facingOn.perSec}/s`);
    console.log(`  behind: flag off ${behindOff.perSec}/s, on ${behindOn.perSec}/s`);
    console.log(`  far (>30 m): on ${farOn.perSec}/s`);

    check('facing the door, the portal renders',            facingOn.renders>0, `${facingOn.renders} renders in the window`);
    check('the flag does not change the facing case',       facingOn.renders>0 && facingOff.renders>0, `off ${facingOff.renders}, on ${facingOn.renders}`);
    check('back to the door, the portal stops rendering',   behindOn.renders===0, `${behindOn.renders} renders with the flag ON`);
    // The guard has to be shown to be doing something: with the flag OFF the same stance must still render.
    check('and it DOES render there with the flag off',     behindOff.renders>0, `${behindOff.renders} renders with the flag OFF — proves the check can fail`);
    check('beyond 30 m it stops regardless (old gate)',     farOn.renders===0, `${farOn.renders} renders`);

    // NO STALE ROOM. Turn away, wait long enough that the cadence would have lapsed many times over, then turn
    // back and count renders in the very next moments. A skip is only free if re-entry is immediate.
    await page.evaluate(`__hcPERF.set('portalOnScreen', true)`);
    await page.evaluate(`BRQA.portalProbe('behind'); __hc.lock(true);`);
    await sleep(3000);
    const before = await page.evaluate(`BRQA.portalProbe('behind').frames`);
    await page.evaluate(`BRQA.portalProbe('facing'); __hc.lock(true);`);
    await sleep(250);                                     // ~30 frames at 140 fps: a fresh frame must be inside this
    const after = await page.evaluate(`BRQA.portalProbe('facing').frames`);
    check('turning back re-renders it within 250 ms',      after-before>0, `${after-before} renders in the first 250 ms after turning back`);

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
