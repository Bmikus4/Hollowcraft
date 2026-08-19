// Multiple pines, per-pine addressing, the right-shift, and PERSISTENCE across a reload.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const ctx=await browser.newContext({viewport:{width:900,height:520}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
const boot=async(pg)=>{ await pg.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
  await pg.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  await pg.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
  await pg.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');"); };
await boot(page);
const B=await page.evaluate('__hc.islandCentres().mass');
await page.evaluate(`__hc.tpAt(${B.x}+Math.cos(150*Math.PI/180)*240, 120, ${B.z}+Math.sin(150*Math.PI/180)*240);`);
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius');");
await sleep(900);
for(const c of ['/pines add 105 -165','/pines add 60','/pines 2 out 40','/pines 3 shift 0','/pines list']){
  const r=await page.evaluate(`__hc.cmdRun(${JSON.stringify(c)})`);
  console.log(c); (r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('    '+x)));
}
await sleep(1200);
const S=await page.evaluate('__hc.pinesState()');
console.log(`  quads ${S.n}, texture ${S.tex} loaded ${S.texLoaded}`);
for(const f of S.facing) console.log(`    dial ${String(f.dial).padStart(5)}  at ${JSON.stringify(f.at)}  ${String(f.distToPlayer).padStart(6)} away  facing ${f.dotToPlayer}  bow ${f.bow}${f.clamped?'  (pulled in)':''}`);
// THE SHIFT: pine 3 was set shift 0, the others keep the 0.5 default. With 0.5 the image's LEFT EDGE should sit
// where its centre would otherwise be, so its centre stands half a width to the player's right.
console.log('  saved to localStorage:', await page.evaluate("(localStorage.getItem('hollowcraft_pines_v1')||'').slice(0,120)"));
// AND IT SURVIVES A RELOAD, which is the whole point of saving it.
await boot(page);
await sleep(1500);
const S2=await page.evaluate('__hc.pinesState()');
console.log(`  after reload: ${S2.list.length} pines restored ->`, JSON.stringify(S2.list));
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
