// ARCHWAYS: round, and with nothing hung in them (Ben 07-28). The old build stepped nine boxes down to the curve and rolled
// the arch independently of the door, so most arches had a leaf in them. Both are asserted here, and a shot is taken so the
// "round" half is judged by eye rather than by my say-so.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);
    await page.evaluate(`__hc.aim(false)`); await page.evaluate(`__hc.qa(48)`);

    // ---- across a wide sample of the loaded halls, no archway may carry a leaf or a lining ----
    const seen = await page.evaluate(`(()=>{ const out={arches:0, withDoor:0, withFrame:0, spans:[], bad:[]};
      for(const [gx,gz] of [[0,0],[1,0],[0,1],[1,1],[-1,0],[0,-1],[-1,-1],[2,1],[1,2]]){
        window.__hcBRX.walkTo(gx,gz);
        for(const a of window.__hcBR.arches()){
          out.arches++; if(a.doorInIt){ out.withDoor++; if(out.bad.length<4) out.bad.push(a); }
          if(a.frameInIt){ out.withFrame++; if(out.bad.length<4) out.bad.push(a); }
          if(out.spans.length<8) out.spans.push(a.span); } }
      return out; })()`);
    console.log('archways sampled:', JSON.stringify(seen));
    T('archways exist to test', seen.arches>0, {arches:seen.arches});
    T('no archway has a door hung in it', seen.withDoor===0, {withDoor:seen.withDoor, bad:seen.bad.slice(0,3)});
    T('no archway has a door lining in it', seen.withFrame===0, {withFrame:seen.withFrame, bad:seen.bad.slice(0,3)});

    // ---- the crown clears the square head, so an arch adds height instead of eating the opening ----
    const forced = await page.evaluate(`window.__hcBR.forceArch()`);
    console.log('forced archway:', JSON.stringify(forced));
    T('an archway crowns ABOVE the door head, never below it', !!forced && forced.crown > forced.head+0.4, forced);

    // ---- it must be ROUND: sample the built geometry's height profile across the span ----
    // The intrados is emitted as a triangle band, so the vertex heights along the span should follow a circle. A stepped
    // arch shows as a staircase in this profile; nine boxes gave nine flat treads.
    if(forced){
      await sleep(600);
      const vert = await page.evaluate(`(window.__hcBR.arches().find(a=>Math.abs(a.cx-${forced.cx})<0.6&&Math.abs(a.cz-${forced.cz})<0.6)||{}).vert===true`);
      const prof = await page.evaluate(`window.__hcBR.archProfile(${forced.cx},${forced.cz},${vert},${forced.span})`);
      console.log('intrados profile (raycast up into the built mesh):', JSON.stringify(prof));
      const ys = (prof||[]).map(p=>p.y).filter(y=>y!=null);
      // A CIRCLE, NOT A STAIRCASE. Compare the measured profile against the semicircle it should be: a stepped arch of nine
      // flat boxes cannot fit it, and neither can a flat lintel. Judged on the crown, the springing and the fit in between.
      // Compared as a SHAPE, with the height offset fitted out: an archway sits at whatever storey its chunk is on, and the
      // question here is whether the curve is a circle — not what absolute y it happens to live at.
      const R=forced.span/2, rel=(t)=>{ const off=(t-0.5)*forced.span*0.96; return Math.sqrt(Math.max(0,R*R-off*off)); };
      const pts=(prof||[]).filter(p=>p.y!=null);
      const base=pts.reduce((s,p)=>s+(p.y-rel(p.t)),0)/(pts.length||1);       // the springing line, least-squares fitted
      // The fit is judged over the CENTRAL span only. Near the springing the curve is almost vertical (dy/dx ≈ 3.4 at the
      // last sample), so a couple of centimetres of sampling offset there is a tenth of a block of apparent error and says
      // nothing about roundness. What discriminates round from stepped over the WHOLE span is the count of distinct
      // heights: a boxed arch has one flat top per box, so nine boxes can only ever produce nine.
      const mid=pts.filter(p=>p.t>0.15 && p.t<0.85);
      const worst=mid.length? Math.max(...mid.map(p=>Math.abs(p.y-(base+rel(p.t))))) : 99;
      const distinct=new Set(ys.map(y=>y.toFixed(3))).size;
      const rise=Math.max(...ys)-Math.min(...ys);
      T('every point across the opening has arch over it', ys.length===(prof||[]).length, {measured:ys.length, of:(prof||[]).length});
      T('the crown stands a radius above the springing', rise > R-rel(0)-0.1, {rise:+rise.toFixed(2), want:+(R-rel(0)).toFixed(2)});
      T('the intrados fits the circle across the central span', worst<0.05, {worstErr:+worst.toFixed(3), springing:+base.toFixed(2)});
      T('the intrados is a curve, not a staircase of flat tops', distinct>20, {distinctHeights:distinct, of:ys.length});
      const l=await page.evaluate(`__hc.look(${forced.cx},${forced.head+0.2},${forced.cz})`);   // aim at the springing so both the curve and the opening under it are in frame
      await page.evaluate(`__hc.qaAt(${forced.cx},${forced.floor+2.6},${forced.cz},70)`);        // and light the arch itself — qa() alone lights the world origin
      await sleep(600);
      const f=path.join(OUT,'archway.png');
      await page.screenshot({path:f});
      console.log('   aim', JSON.stringify(l), '->', f);
    }
    T('zero page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('\n'+fails+' FAILING') : '\nALL PASS');
  process.exit(fails?1:0);
})();
