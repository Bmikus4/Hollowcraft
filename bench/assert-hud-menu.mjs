// THE HITMARKER LANDS, THE KEY ART HAS DEPTH, AND THE MENU DOES NOT GROW ON BOOT.
//
// All three are claims about the first frames of the game, which is the one place a screenshot is useless:
// the menu's growth was a jump between two paints, the parallax is a relationship between two elements, and
// the marker exists for a fifth of a second. Every one of them is read off the live document instead.
//
//   node bench/assert-hud-menu.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); });
const waitHttp = u => new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const r=http.get(u,x=>{x.resume();res();}); r.on('error',()=>Date.now()-t0>20000?rej(new Error('down')):setTimeout(p,250)); })(); });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const port = await freePort();
const server = spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
let browser, checks=0, fails=0;
const check=(n,ok,d)=>{checks++;if(!ok)fails++;console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:''));};
try{
  const base='http://127.0.0.1:'+port;
  await waitHttp(base+'/index.html');
  browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const errs=[];
  // ---- the menu, at a viewport where --uiz is NOT 1 --------------------------------------------------
  const page = await (await browser.newContext({viewport:{width:1920,height:1080}})).newPage();
  page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
  page.on('console',m=>{if(m.type()==='error'&&!/favicon|404/.test(m.text()))errs.push(m.text());});
  // The scale must be right in the very first frame the document has: read it the moment the DOM is parsed.
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded',timeout:120000});
  const early = await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--uiz').trim()`);
  check('the UI scale is set before the module runs', early==='1.5', '--uiz is '+early+' at domcontentloaded (1920x1080 -> 1.5)');
  await page.waitForFunction(`document.getElementById('menufx') && getComputedStyle(document.getElementById('menufx')).display!=='none'`,null,{timeout:120000});
  const late = await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--uiz').trim()`);
  check('and it does not change once the game has booted', late===early, early+' -> '+late);
  const t0 = await page.evaluate(`getComputedStyle(document.getElementById('bgvid')).transform`);
  await page.mouse.move(1900,900); await sleep(700);
  const t1 = await page.evaluate(`(()=>({bg:getComputedStyle(document.getElementById('bgvid')).transform, fx:getComputedStyle(document.getElementById('menufx')).transform}))()`);
  await page.mouse.move(20,100); await sleep(700);
  const t2 = await page.evaluate(`getComputedStyle(document.getElementById('bgvid')).transform`);
  console.log('  art transform: '+t0+' -> '+t1.bg+' -> '+t2);
  check('the key art moves with the pointer', t1.bg!==t2 && /matrix/.test(t1.bg), t1.bg+' vs '+t2);
  check('the lit layer carries the SAME transform as the art', t1.fx===t1.bg, 'menufx '+t1.fx);
  const sc = +(/matrix\(([\d.]+)/.exec(t1.bg)||[0,0])[1];
  check('the art is oversized enough to move without showing an edge', sc>1.02 && sc<1.12, 'scale '+sc);
  await page.close();

  // ---- the hitmarker -------------------------------------------------------------------------------
  const p2 = await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
  p2.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
  await p2.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
  await p2.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
  await p2.waitForFunction(`document.getElementById('load').style.display==='none'`,null,{timeout:240000});
  const idle = await p2.evaluate(`(()=>{const s=getComputedStyle(document.getElementById('hitm'));return {op:s.opacity,w:s.width};})()`);
  check('the marker is invisible until something is hit', +idle.op===0, 'opacity '+idle.op+', '+idle.w);
  check('it is TINY — smaller than the reticle ring', parseFloat(idle.w)<=14, idle.w);
  // A REAL ROUND, down the real path: __hc.fire calls fireGun, which walks _traceBullet. girlShoot pokes
  // girlRayHit directly and would prove nothing about the wiring — the marker hangs off the trace, not the hit.
  await p2.evaluate(`__hc.hold('ar15'); __hc.girl(14);`);
  await sleep(600);
  const before = await p2.evaluate(`getComputedStyle(document.getElementById('hitm')).animationName`);
  await p2.evaluate(`__hc.fire(3)`);
  const after = await p2.evaluate(`(()=>{const s=getComputedStyle(document.getElementById('hitm'));return {an:s.animationName,op:s.opacity};})()`);
  check('a round that lands on a creature shows the marker', after.an==='hitmpop' && before!=='hitmpop', before+' -> '+after.an+' (opacity '+after.op+')');
  await sleep(400);
  const gone = await p2.evaluate(`getComputedStyle(document.getElementById('hitm')).opacity`);
  check('and it fades out on its own', +gone===0, 'opacity '+gone);
  check('no page errors', errs.length===0, errs.slice(0,3).join(' | ')||'clean');
}catch(e){ console.log('  HARNESS ERROR: '+(e&&e.stack||e)); fails++; }
finally{ try{ await browser.close(); }catch(e){} server.kill(); }
console.log('\n  '+(checks-fails)+'/'+checks+' checks pass');
process.exit(fails?1:0);
