// THE MIP CHAIN IS WHAT CLOSES A CANOPY (hypothesis under test). The leaf tile is 43.8% clear texels, so its mean alpha
// is 0.56; the atlas is sampled with textureGrad through a mip chain, and the cutout is a HARDCODED `_tex.a < 0.5`. At
// any distance where the mip level rises, every texel's averaged alpha sits above 0.5 and NOTHING is discarded — the
// canopy becomes a solid shell however many layers are meshed behind it. That is Ben's "I can only see the first layer
// of the leaf blocks from the outside".
// ?nomip already exists (no mipmaps, NearestFilter), so the A/B is two page loads at the same vantage: if mips are the
// cause, the nomip arm shows markedly MORE sky through the canopy at the same camera.
// node bench/tmp-leaf-mip.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function shares(file){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let sky=0,lit=0,dark=0,n=0;
  for(let y=0;y<440;y++) for(let x=0;x<P.w;x++){
    const i=(y*P.w+x)*ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2], L=(r+g+b)/3;
    n++;
    if(b>110 && b>=g && L>95) sky++;
    else if(g>r && g>b){ if(L>60) lit++; else dark++; }
  }
  return { sky:+(100*sky/n).toFixed(1), litGreen:+(100*lit/n).toFixed(1), darkGreen:+(100*dark/n).toFixed(1) };
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  const run=async(q,tag,dist)=>{
    const page=await (await browser.newContext({viewport:{width:1000,height:560}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1'+q,{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    const out={};
    for(const d of dist){
      await page.evaluate('__hc.tpAt('+(spot.x+d)+','+(spot.h+13)+','+(spot.z+d)+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
      await sleep(3500);
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+11)+','+spot.z+')');
      await sleep(1200); await page.evaluate('__hc.setTime(0.25)'); await sleep(300);
      const f=path.join(ROOT,'bench','results','leaf-mip-'+tag+'-'+d+'.png');
      await page.screenshot({ path:f });
      out[d]=shares(f);
    }
    await page.context().close();
    return { spot, out };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const DIST=[10,20,40];
    const mip  = await run('','mip',DIST);
    const nomip= await run('&nomip=1','nomip',DIST);
    console.log('tree ' + JSON.stringify(mip.spot));
    console.log('distance   MIPPED (shipped)                 NO MIPS');
    for(const d of DIST) console.log('  '+String(d).padStart(3)+' blocks  sky '+String(mip.out[d].sky).padStart(5)+'%  dark '+String(mip.out[d].darkGreen).padStart(5)+
      '%      sky '+String(nomip.out[d].sky).padStart(5)+'%  dark '+String(nomip.out[d].darkGreen).padStart(5)+'%');
  } finally { await browser.close(); server.kill(); }
})();
