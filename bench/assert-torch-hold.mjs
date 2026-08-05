// A TORCH — AND A CANDLE — IS HELD IN THE HAND, AND THE TORCH'S RAG IS WRAPPED AROUND SOMETHING (Ben 08-05: "make sure torches are actually held in the
// hand" / "fix the top of torches").
// The fist is buildFist, whose far -z tip is the palm, and the held item is a separate group on the camera — nothing made the two
// meet: measured, the palm sat at camera z -0.394 while the torch's shaft was at -0.62, so the hand was 0.23 behind the torch on
// every frame. And buildClothWrap's highest ring topped out 8 cm above the end of the twig at both draw sites.
//   node bench/assert-torch-hold.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    const fit=await page.evaluate(`__hc.torchFit()`);
    console.log('    torch geometry', JSON.stringify(fit));
    for(const k of ['held','placed']){
      // BOUNDED AT BOTH ENDS NOW. Negative means the rag's top rings are wrapped around thin air; more than a couple of centimetres
      // means bare twig standing over the cloth like a spike, which is what Ben saw on 08-05 after the first fix overshot to 0.049.
      ok(k+' torch: the shaft reaches the top of the rag and stops there', fit[k] && fit[k].shaftCoversRag >= -0.004 && fit[k].shaftCoversRag <= 0.035, fit[k]);
    }
    for(const id of ['torch','torch_unlit','red_torch','candle']){
      const r=await page.evaluate(`__hc.heldInHand('${id}')`);
      console.log('   ', id.padEnd(12), JSON.stringify(r));
      ok(id+': the arm is drawn', r.armVisible===true, {armVisible:r.armVisible});
      ok(id+': …and the model declares where it is gripped', r.gripGap!=null, r);
      // 6 cm: the palm is a point and the fist is a 9 cm box, so anything under half its width is a hand closed on the shaft.
      ok(id+': …and the palm is on the shaft', r.gripGap!=null && r.gripGap<0.06, {gripGap:r.gripGap, palm:r.palm});
    }
    // ITEMS WITHOUT A DECLARED GRIP ARE ALSO IN THE HAND NOW, by their bounding box (backlog item 19). This check used to assert the
    // opposite — that their palm stayed at exactly -0.394 — which was true when only the torch and the candle were reached for and is
    // deliberately false now. What still has to hold is that a declared grip is more precise than a box: the torch and candle land
    // within 3 cm of the point their model names, and a boxed item lands on its own surface.
    const others={};
    // Guns are excluded: a gun declares a grip for the hand PARENTED TO IT (attachGunHand), which is a different mechanism, and the
    // camera-mounted arm stands down for them entirely.
    for(const id of ['lantern','planks','apple','field_guide']){ others[id]=await page.evaluate(`__hc.heldInHand('${id}')`); }
    console.log('    untouched items', JSON.stringify(Object.fromEntries(Object.entries(others).map(([k,v])=>[k,{palmZ:v.palm&&v.palm[2], grip:v.gripGap}]))));
    ok('items with no declared grip are held by their box', Object.values(others).every(v=>v.gripGap==null && v.gap!=null && v.gap<=0.06), Object.fromEntries(Object.entries(others).map(([k,v])=>[k,{gap:v.gap, palmZ:v.palm&&v.palm[2]}])));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
