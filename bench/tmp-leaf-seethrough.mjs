// "still cant see those leaves through other leaves" (Ben 08-05). The inner layers were meshed and drawn; the uv of a
// face has no term in the face's own axis, so every layer was transparent in the SAME texels and a ray through the first
// hole reached the sky. This measures exactly that: how much SKY is visible through the middle of a canopy.
//
// A TRUE PAIRED A/B in one page — __hc.leafUV(false|true) remeshes the world with the per-layer mirror off/on, same
// camera, same chunks, same tree. If the mirror works, the sky share inside the canopy crop falls and the pixels that
// stop being sky become dark green (a leaf in the layer behind), so the crop's green share rises.
// node bench/tmp-leaf-seethrough.mjs
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

// sky vs leaf, over a crop. The sky at noon is bright and blue-dominant; a leaf is dark and green-dominant.
function classify(file, x0,y0,w,h){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch;
  let sky=0, green=0, n=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){
    const i=(y*P.w+x)*ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    n++;
    if(b>110 && b>=g && (r+g+b)/3>95) sky++;
    else if(g>r && g>b) green++;
  }
  return { sky:+(100*sky/n).toFixed(1), green:+(100*green/n).toFixed(1), n };
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
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    console.log('tree ' + JSON.stringify(spot));
    // THE VANTAGE IS OUTSIDE THE WOOD, LOOKING AT A CANOPY AGAINST THE SKY — that is where the symptom is. Standing
    // under the canopy measures nothing: at that depth the layers overlap enough to be opaque whatever the uv does
    // (measured: 0% sky in the crop with the mirror both off and on).
    await page.evaluate('__hc.tpAt('+(spot.x+26)+','+(spot.h+16)+','+(spot.z+26)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+13)+','+spot.z+')');
    await sleep(1500);
    const arm = async (on,tag)=>{
      console.log('  ' + tag + ' ' + JSON.stringify(await page.evaluate('__hc.leafUV('+on+')')));
      await sleep(2500); await page.evaluate('__hc.setTime(0.25)'); await sleep(400);
      const f=path.join(ROOT,'bench','results','leaf-seethrough-'+tag+'.png');
      await page.screenshot({ path:f });
      // THE WHOLE FRAME above the HUD. A fixed crop cannot be trusted to sit inside a silhouette the harness has not
      // measured; the camera is identical across arms, so every pixel that stops being sky is a hole that now has a
      // leaf behind it, and the sky at the frame's edges contributes the same constant to both arms.
      return { tag, c:classify(f, 0,0, 1000,440), file:f };
    };
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const off = await arm(false,'mirror-off');
    const on  = await arm(true ,'mirror-on');
    const off2= await arm(false,'mirror-off2');
    console.log('\nRESULT  crop 300x200 in the middle of the canopy');
    for(const r of [off,on,off2]) console.log('  '+r.tag.padEnd(11)+'  sky '+String(r.c.sky).padStart(5)+'%   green '+String(r.c.green).padStart(5)+'%');
    console.log('  sky through the canopy: ' + off.c.sky + '% / ' + off2.c.sky + '% (mirror off) -> ' + on.c.sky + '% (mirror on)');
  } finally { await browser.close(); server.kill(); }
})();
