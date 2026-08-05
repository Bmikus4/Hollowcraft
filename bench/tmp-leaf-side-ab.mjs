// What does leafMat.side = DoubleSide cost, on its own, now that the leaf pass meshes every layer?
// A TRUE PAIRED A/B: side is a runtime flag, so both arms are the same page, the same chunks and the same frame — the
// only in-page dial the three leaf changes have. Every chunk has its own material clone (see leafCut), so all of them
// have to be told or the measurement is of the base material nothing draws with.
// node bench/tmp-leaf-side-ab.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const SET = `(function(dbl){ let n=0; const S=dbl?2:0;   // THREE.DoubleSide===2, FrontSide===0
  __hc.leafMeshes().forEach(m=>{ if(m.material){ m.material.side=S; m.material.needsUpdate=true; n++; } });
  return n; })`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:1000,height:560}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h}; } return null; })()`);
    await page.evaluate('__hc.tpAt('+(spot.x+22)+','+(spot.h+13)+','+(spot.z+22)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+10)+','+spot.z+')');
    await sleep(2000);
    // THE CLOCK IS NOT FREEZABLE: re-pin before every sample or the two arms are taken at different sun elevations.
    const fps=async()=>{ const s=[]; for(let i=0;i<14;i++){ await sleep(400); await page.evaluate('__hc.setTime(0.25)'); s.push((await page.evaluate('__hc.st()')).fps); } s.sort((a,b)=>a-b); return s[s.length>>1]; };
    const touched=await page.evaluate(SET+'(true)');
    const dbl1=await fps();
    await page.evaluate(SET+'(false)'); const front=await fps();
    await page.evaluate(SET+'(true)');  const dbl2=await fps();   // twice, in case the first arm paid for a shader recompile
    console.log('leaf meshes touched ' + touched);
    console.log('  DoubleSide ' + dbl1 + ' fps   FrontSide ' + front + ' fps   DoubleSide again ' + dbl2 + ' fps');
    const d=((dbl1+dbl2)/2), ms=(1000/d)-(1000/front);
    console.log('  DoubleSide costs ' + ms.toFixed(2) + ' ms/frame at this vantage (' + (d-front).toFixed(1) + ' fps)');
  } finally { await browser.close(); server.kill(); }
})();
