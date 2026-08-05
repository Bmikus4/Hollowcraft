// "trees new leaves are not fully affected by fog" (Ben 08-05, after the leaf layers shipped). The leaf material's fog is
// three's own `#include <fog_fragment>`, so the interesting question is what the injected code does AROUND it. Two things
// do: FOL_UNLIT_FLOOR raises a leaf to a fraction of its OWN texel colour, and the night-foliage tint mixes toward
// uFolNight AFTER the fog. Either could leave a leaf greener than the fog it sits in.
// THE MEASUREMENT IS THE DISTANCE FROM THE FOG'S OWN COLOUR. With the bank forced fully on, look at a wood far enough
// away that terrain has gone to fog, then compare how far the green pixels are from the fog colour against how far
// everything else is. A leaf that is fully fogged is as close to it as the ground beside it.
// Arms: fog on/off, and ?folfloor=0 to take the foliage floor out (an existing flag, no edit needed).
// node bench/tmp-leaf-fog.mjs
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

// The fog colour is read from the frame itself: the sky just above the horizon in a full bank IS the fog. Then every
// pixel's distance from it, split by whether the pixel is green-dominant (a leaf) or not (terrain, rock, trunk).
function fogDist(file, fogRow){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch;
  let fr=0,fg=0,fb=0,fn=0;
  for(let x=0;x<P.w;x++){ const i=(fogRow*P.w+x)*ch; fr+=P.data[i]; fg+=P.data[i+1]; fb+=P.data[i+2]; fn++; }
  fr/=fn; fg/=fn; fb/=fn;
  let gs=0,gn=0, os=0,on=0;
  for(let y=fogRow+20;y<400;y++) for(let x=0;x<P.w;x++){
    const i=(y*P.w+x)*ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    const d=Math.hypot(r-fr,g-fg,b-fb);
    if(g>r && g>b){ gs+=d; gn++; } else { os+=d; on++; }
  }
  return { fog:[+fr.toFixed(1),+fg.toFixed(1),+fb.toFixed(1)],
           greenDist: gn?+(gs/gn).toFixed(2):null, greenPx:gn,
           otherDist: on?+(os/on).toFixed(2):null, otherPx:on };
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const run=async(q,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1'+q,{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h}; } return null; })()`);
    // ON THE GROUND, WELL BACK, LOOKING LEVEL AT THE WOOD. tpAt does NOT snap to the ground, so the first version of this
    // harness put the camera 26 blocks up, let it fall for five seconds, and photographed the inside of a canopy.
    await page.evaluate('__hc.tpAt('+(spot.x+90)+','+(spot.h+4)+','+(spot.z+90)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(5000);
    const out={};
    for(const fg of [0,1]){
      await page.evaluate('__hc.fog('+fg+')');
      await sleep(2500); await page.evaluate('__hc.setTime(0.25)');
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+12)+','+spot.z+')');
      await sleep(900);
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+12)+','+spot.z+')');   // aim twice: the eye must have settled first
      await page.evaluate('__hc.setTime(0.25)'); await sleep(400);
      const f=path.join(ROOT,'bench','results','leaffog-'+tag+'-fog'+fg+'.png');
      await page.screenshot({path:f});
      out['fog'+fg]=fogDist(f, 24);   // row 24 is sky on a level look, and in a full bank the sky at the horizon IS the fog colour
    }
    await page.context().close();
    return { spot, out };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const a=await run('','shipped');
    const b=await run('&folfloor=0','nofloor');
    console.log('tree ' + JSON.stringify(a.spot));
    for(const [tag,r] of [['shipped',a],['folfloor=0',b]]){
      for(const k of ['fog0','fog1']){
        const v=r.out[k];
        console.log('  '+tag.padEnd(11)+' '+k+'  fog colour '+JSON.stringify(v.fog)+
          '   green pixels sit '+v.greenDist+' from it ('+v.greenPx+' px), everything else '+v.otherDist+' ('+v.otherPx+' px)');
      }
    }
  } finally { await browser.close(); server.kill(); }
})();
