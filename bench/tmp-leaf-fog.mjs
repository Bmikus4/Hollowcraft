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

// THE REFERENCE IS THE SKY, AND IT HAS TO BE FOUND RATHER THAN ASSUMED. A fixed row read the canopy on the first two
// runs of this harness and reported the fog colour as dark green, which made every number meaningless. The sky is the
// BRIGHTEST thing in the top of a daylight frame, so the reference is the mean of the top decile of the top 60 rows.
// Then how far each population sits from it: green-dominant pixels (leaf) against the rest (terrain, trunk, rock). Fog
// pulls everything toward the sky, so if the leaves are under-fogged their distance falls by less than the terrain's.
function fogDist(file){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch;
  const top=[];
  for(let y=0;y<60;y++) for(let x=0;x<P.w;x++){ const i=(y*P.w+x)*ch; top.push([(P.data[i]+P.data[i+1]+P.data[i+2])/3, i]); }
  top.sort((a,b)=>b[0]-a[0]);
  const keep=top.slice(0, Math.max(1, top.length/10|0));
  let fr=0,fg=0,fb=0; for(const [,i] of keep){ fr+=P.data[i]; fg+=P.data[i+1]; fb+=P.data[i+2]; }
  fr/=keep.length; fg/=keep.length; fb/=keep.length;
  let gs=0,gn=0, os=0,on=0, gl=0, ol=0;
  for(let y=80;y<400;y++) for(let x=0;x<P.w;x++){
    const i=(y*P.w+x)*ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    const d=Math.hypot(r-fr,g-fg,b-fb), L=(r+g+b)/3;
    if(g>r && g>b){ gs+=d; gl+=L; gn++; } else { os+=d; ol+=L; on++; }
  }
  return { sky:[+fr.toFixed(1),+fg.toFixed(1),+fb.toFixed(1)],
           leafDist: gn?+(gs/gn).toFixed(2):null, leafLuma: gn?+(gl/gn).toFixed(1):null, leafPx:gn,
           terrDist: on?+(os/on).toFixed(2):null, terrLuma: on?+(ol/on).toFixed(1):null, terrPx:on };
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
    for(const fg of [0,0.8]){   // 0.8 is the value assert-band-fog forces; 1 is not necessarily reachable
      // AND CHECK THE SETTER TOOK. __hc.fog returns the bank it actually holds; the first version of this harness compared
      // two arms that were both clear and reported them identical, which they were.
      const got=await page.evaluate('__hc.fog('+fg+')');
      console.log('    fog asked ' + fg + ' -> bank ' + JSON.stringify(got));
      await sleep(4000); await page.evaluate('__hc.setTime(0.25)');
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+12)+','+spot.z+')');
      await sleep(900);
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+12)+','+spot.z+')');   // aim twice: the eye must have settled first
      await page.evaluate('__hc.setTime(0.25)'); await sleep(400);
      const f=path.join(ROOT,'bench','results','leaffog-'+tag+'-fog'+fg+'.png');
      await page.screenshot({path:f});
      out['fog'+fg]=fogDist(f);
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
      for(const k of ['fog0','fog0.8']){
        const v=r.out[k]; if(!v) continue;
        console.log('  '+tag.padEnd(11)+' '+k.padEnd(7)+' sky '+JSON.stringify(v.sky)+
          '   leaf '+v.leafDist+' from sky (luma '+v.leafLuma+', '+v.leafPx+' px)   terrain '+v.terrDist+' (luma '+v.terrLuma+', '+v.terrPx+' px)');
      }
      const a0=r.out['fog0'], a1=r.out['fog0.8'];
      if(a0&&a1) console.log('  '+tag.padEnd(11)+' fog closed the gap to the sky by: leaf '+
        (100*(1-a1.leafDist/a0.leafDist)).toFixed(1)+'%   terrain '+(100*(1-a1.terrDist/a0.terrDist)).toFixed(1)+'%');
    }
  } finally { await browser.close(); server.kill(); }
})();
