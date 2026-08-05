// Is the north/south darkness a BAKE bug or is the terrain itself anisotropic? __hc.skyCensus() says the +z and -z
// buckets carry twice the dark share of +x and -x, and both candidate places in the mesher (the per-axis mask, _snapT's
// construction from nine htop arrays) read symmetric. So this asks the question one level down, with no renderer and no
// bake in the way: over a big grid of columns, how often is a side face BURIED by its own neighbour column?
//   a +x face of column (x,z) is buried when height(x+1,z) > height(x,z)
// If the buried shares differ by axis, the asymmetry is in the terrain and the bake is only reporting it. If they agree,
// the bake is inventing it and the census's Z bias is the bug.
// Heights come from __hc.treeGates(x,z).h, which is the surface height of any column, tree or not.
// node bench/tmp-face-anisotropy.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ new Promise(r=>r()).then(()=>{}); return new Promise((res2,rej2)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res2();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej2(new Error('down')); else setTimeout(poll,250); }); })(); }).then(res,rej); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const SCAN=`(function(){
  const P=__hc.probe(), R=100, H={};
  const h=(x,z)=>{ const k=x+','+z; let v=H[k]; if(v===undefined){ const g=__hc.treeGates(x,z); v=H[k]=(g&&g.h!=null)?g.h:null; } return v; };
  let bx=0,nx=0, bz=0,nz=0, dxs=0, dzs=0;
  for(let x=Math.round(P.x)-R; x<=Math.round(P.x)+R; x+=2) for(let z=Math.round(P.z)-R; z<=Math.round(P.z)+R; z+=2){
    const h0=h(x,z); if(h0==null) continue;
    const hx=h(x+1,z), hz=h(x,z+1);
    if(hx!=null){ nx++; if(hx>h0) bx++; dxs+=Math.abs(hx-h0); }
    if(hz!=null){ nz++; if(hz>h0) bz++; dzs+=Math.abs(hz-h0); }
  }
  return { samplesX:nx, buriedXshare:nx?+(bx/nx).toFixed(4):null, meanStepX:nx?+(dxs/nx).toFixed(3):null,
           samplesZ:nz, buriedZshare:nz?+(bz/nz).toFixed(4):null, meanStepZ:nz?+(dzs/nz).toFixed(3):null };
})`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3000);
    const r=await page.evaluate(SCAN+'()');
    console.log(JSON.stringify(r,null,1));
    console.log('  buried side faces: X ' + (100*r.buriedXshare).toFixed(2) + '%   Z ' + (100*r.buriedZshare).toFixed(2) + '%');
    console.log('  mean step between neighbouring columns: X ' + r.meanStepX + '   Z ' + r.meanStepZ);
  } finally { await browser.close(); server.kill(); }
})();
