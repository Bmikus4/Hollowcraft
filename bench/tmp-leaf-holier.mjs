// "still cant see those leaves through other leaves" (Ben 08-05), with the inner layers now meshed AND their tiles
// mirrored per layer (measured: mirror reaches 49% of leaf uv, sky share unmoved 12.2% -> 13.0%). So the layers are
// there and they are not aligned — what is left is how much of the leaf TILE is clear at all. If a leaf face discards
// only a few texels, there is no window to see the next layer through, and no mesher change can make one.
// Reports the clear-texel fraction of every leaf tile as painted, then sweeps alphaTest (__hc.leafCut, a live dial
// that discards more of the tile) and shoots the same canopy at each value.
// node bench/tmp-leaf-holier.mjs
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

// sky / green / dark shares over the frame above the HUD. "dark green" is the signature of a leaf in a layer BEHIND
// the first one: same hue, less delivered light.
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
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:1000,height:560}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const cp = await page.evaluate('(()=>{ const c=__hc.canopyProbe(); return {alpha:c.alpha, alphaTest:c.alphaTest}; })()');
    console.log('leaf tile CLEAR-texel fraction as painted: ' + JSON.stringify(cp));
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    console.log('tree ' + JSON.stringify(spot));
    await page.evaluate('__hc.tpAt('+(spot.x+14)+','+(spot.h+15)+','+(spot.z+14)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+12)+','+spot.z+')');
    await sleep(1500);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    for(const a of [0.5, 0.65, 0.8]){
      await page.evaluate('__hc.leafCut('+a+')'); await sleep(1200); await page.evaluate('__hc.setTime(0.25)'); await sleep(300);
      const f=path.join(ROOT,'bench','results','leaf-holier-'+String(a).replace('.','')+'.png');
      await page.screenshot({ path:f });
      console.log('  alphaTest '+a+'   '+JSON.stringify(shares(f)));
    }
  } finally { await browser.close(); server.kill(); }
})();
