// WHAT THE POST CHAIN COSTS, PASS BY PASS, at the two sites that are over the frame budget.
//
// This is the measurement the post-processing R&D pass needs before it starts, and the resume file's §5 debt in its
// specific form: the frame is over budget, nobody knows which part of it, and adding grading to a scene that is 40%
// over is how a pass gets blamed for a cost it did not create. `__hc.pass(name,on)` exists exactly for this.
//
// ROUND-ROBIN, NOT BLOCKED, AND THAT IS THE WHOLE METHOD HERE. The first version of this file ran three windows of A,
// then three of B, and produced a forest table in which turning EVERY pass off made the frame slower - godray off
// +1.28 ms, bloom off +0.87, grade off +0.80. Nothing can cost negative milliseconds, so that table was measuring the
// machine getting slower over the run, not the passes. This box has a failing cooling fan and had been under sustained
// GPU load for hours; a blocked design attributes all of that drift to whatever configuration happened to run late.
// Interleaving one window each, A B C A B C, spreads the drift evenly across every configuration instead, so it cancels
// in the differences. The spread column stays, because a drift this design cannot remove still shows up there.
//
//   node bench/tmp-post-price.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const DUR=7000, REPS=3;
const ALL=['ssao','godray','bloom','grade','motion'];
const on=()=>ALL.map(p=>`__hc.pass('${p}',true);`).join('');
const CFGS=[
  ['shipped',        on()],
  ['ssao off',       on()+`__hc.pass('ssao',false);`],
  ['godray off',     on()+`__hc.pass('godray',false);`],
  ['bloom off',      on()+`__hc.pass('bloom',false);`],
  ['grade off',      on()+`__hc.pass('grade',false);`],
  ['motion off',     on()+`__hc.pass('motion',false);`],
  ['whole chain off',ALL.map(p=>`__hc.pass('${p}',false);`).join('')],
  ['mountains off',  on()+`__hc.mountains({on:false});`],
];
const med=a=>{ const s=[...a].sort((x,y)=>x-y); return s[s.length>>1]; };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo = 1;`);
    await page.evaluate(HELPERS);
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cinema(true); try{__hc.fpsPin(240);}catch(e){}`);
    console.log(`  gpu ${JSON.stringify((await page.evaluate(`__hcPERF.ref()`)).gpu)}`);
    for(const [siteName, go] of [['shore',`H.setTime(0.35); goShore();`], ['forest',`H.setTime(0.35); goForest(); H.cam({yaw:0.7, pitch:-0.02});`]]){
      console.log(`  === ${siteName}`);
      await page.evaluate(`(function(){ ${go} })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(5000);
      const acc=CFGS.map(()=>({meds:[],p99s:[]}));
      for(let r=0;r<REPS;r++){
        for(let i=0;i<CFGS.length;i++){
          await page.evaluate(CFGS[i][1]); await sleep(900);
          await page.evaluate(`__hcPERF.reset()`); await sleep(DUR);
          const q=await page.evaluate(`(()=>{ const f=__hcPERF.live(); return { med:f.median, p99:f.p99 }; })()`);
          acc[i].meds.push(q.med); acc[i].p99s.push(q.p99);
        }
        console.log(`    -- round ${r+1} of ${REPS}: ${CFGS.map((c,i)=>c[0]+' '+acc[i].meds[r]).join(' | ')}`);
      }
      const rows=CFGS.map((c,i)=>{ const m=med(acc[i].meds), spread=+(Math.max(...acc[i].meds)-Math.min(...acc[i].meds)).toFixed(2);
        console.log(`    ${c[0].padEnd(17)} med ${String(m).padEnd(7)} spread ${String(spread).padEnd(6)} p99 ${med(acc[i].p99s)}`);
        return [c[0],m,spread,med(acc[i].p99s)]; });
      const shipped=rows[0][1];
      console.log(`    --- against shipped (${shipped} ms), only differences larger than that row's own spread mean anything:`);
      for(const [label,m,spread] of rows.slice(1)) console.log(`        ${label.padEnd(17)} ${(m-shipped>=0?'+':'')}${(m-shipped).toFixed(2)} ms   (spread ${spread})`);
      await page.evaluate(on()+`__hc.mountains({on:true});`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
