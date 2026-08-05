// DOES A WHOLE WALL FACE STAND INSIDE ANOTHER ONE — the "sheet" half of Ben's wall-edge report.
//
// `__hcBR.wallOverlaps` already separates two shapes: `growth`, where two collinear runs each grew BR_WT/2 toward each
// other and overlap by about a wall thickness, and `sheet`, where they cover the SAME span for metres. Growth draws a
// hairline. A sheet is an entire 8 m wall face drawn twice in one merged geometry, and that is a different bug with a
// different cause, so it gets its own count here.
//
// WHY DIRECTION IS THE DISCRIMINATOR: `brxEmitWall`'s `pushWall` bails on `a1-a0<=0.001`, so every run it emits ascends
// along its own axis. The stair-well lining (`seg` beside `BR.stairs.push`) does not go through `pushWall` and emits
// `seg(R.a1, fixed)` whenever `R.out<0`, which DESCENDS. So a record with z1<z0 or x1<x0 can only have come from a well
// lining, and that tells us which emitter to fix without tagging anything in the source.
//
// `assert-br-overlaps.mjs` walks the eight regions around the entry and reports 0 — the shape is real but rare, so it
// needs seeds AND distance, not one neighbourhood. Sweeps with `__hcBR.seed()` in ONE page: `?brseed=` does not reach
// `BR.seed` on the entry path (three values once returned one identical maze three times).
//
// usage: node bench/br-wall-sheets.mjs      (HC_ROOT=<pinned tree>)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const ARGS=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--disable-frame-rate-limit'];

// Calls the IN-PAGE probe. `BR`, `AC`, `scene` are module-scoped and not on `window`, so a page.evaluate that reaches
// for BR.walls throws ReferenceError — which reads as "no walls" rather than as a broken bench. The direction and
// stairwell flags live on `__hcBRX.wallOverlaps`'s records for that reason.
const AUDIT=`window.__hcBRX.wallOverlaps()`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:800,height:600}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);

    // CONTROL FIRST, on the arm that must FAIL: a cloned wall shifted half its own length is by definition a collinear
    // same-storey overlap. If this audit cannot see that, every zero below is a statement about the audit.
    const inj=await page.evaluate(`window.__hcBRX.injectOverlap()`);
    const withInj=await page.evaluate(AUDIT);
    await page.evaluate(`window.__hcBRX.clearInjected()`);
    const clean=await page.evaluate(AUDIT);
    console.log('CONTROL  injected one collinear clone -> sheet '+(clean.sheet||0)+' -> '+(withInj.sheet||0)+
                ((withInj.sheet||0)>(clean.sheet||0)?'   CAUGHT — the audit can fire':'   BLIND — everything below is meaningless'));

    let tot={sheet:0,growth:0,desc:0,well:0,worst:0,places:0,walls:0};
    for(const seed of [99991,1234567,31337,4242,777]){
      const got=await page.evaluate(`window.__hcBR.seed(${seed})`); await sleep(2200);
      for(const [dx,dz] of [[0,0],[240,0],[-240,-240]]){
        await page.evaluate(`window.__hcBR.tp(${dx},${dz})`); await sleep(2200);
        const r=await page.evaluate(AUDIT);
        const sh=r.sheet||0, gr=r.growth||0, sd=r.sheetDesc||0, sw=r.sheetWell||0;
        tot.places++; tot.walls+=r.walls; tot.sheet+=sh; tot.growth+=gr; tot.desc+=sd; tot.well+=sw;
        if(r.worst>tot.worst) tot.worst=r.worst;
        console.log('seed '+String(got).padEnd(8)+' tp '+String(dx+','+dz).padEnd(10)+
                    ' walls='+String(r.walls).padStart(4)+
                    '  SHEET='+String(sh).padStart(2)+' (desc '+sd+', in-well '+sw+')'+
                    '  growth='+String(gr).padStart(3)+'  worst='+r.worst+'  buried='+(r.buried||0));
        const shs=(r.sample||[]).filter(s=>s.kind==='sheet');
        if(shs.length) console.log('        '+JSON.stringify(shs[0]));
      }
    }
    console.log('\n'+tot.places+' generations, '+tot.walls+' wall records');
    console.log('SHEET overlaps '+tot.sheet+'  of which '+tot.desc+' involve a DESCENDING record (well lining only) and '+
                tot.well+' sit in a stairwell footprint');
    console.log('growth overlaps '+tot.growth+'   worst sheet span '+tot.worst+' m');
    console.log('RESULT: '+(tot.sheet===0?'PASS':'FAIL — '+tot.sheet+' whole wall faces drawn twice'));
    await browser.close();
  } finally { server.kill(); }
})();
