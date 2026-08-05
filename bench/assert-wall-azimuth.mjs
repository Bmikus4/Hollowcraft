// THE SUNLESS WALL, AS A PAIR OF NUMBERS AT FOUR HOURS. Ben: "some north and south facing block faces are completely
// blacked out ... IT is ONLY north and south facing ones". The cause is index.html:8479 —
//   _sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize()
// the sweep is in the X-Y plane and the Z component is a CONSTANT +0.35, so cos(ang) gives each of +x and -x a full
// half-day of direct sun while a -z face has N.L about -0.33 at every hour of every day and never takes any.
//
// Both fixes for that are look decisions on a signed-off daylight frame (move the sun's path, or lift a sunless face off
// black), so this harness does not fix anything: it is the measurement that makes either one checkable the moment Ben
// picks it. Build a stone box on open ground and read the luma of its -x wall against its -z wall through the day.
//   WHAT IT ASSERTS TODAY: the -x wall's luma VARIES across the day (the sun crosses it) while the -z wall's does not.
//   That is the defect, stated as an invariant, so it goes green the moment either fix lands and stays green after.
// One frame per hour from a fixed diagonal vantage that sees both walls at once, so the two numbers share a frame, an
// exposure and a sky: nothing in the comparison can drift between them.
// node bench/assert-wall-azimuth.mjs
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
function luma(file,x0,y0,w,h){ const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const i=(y*P.w+x)*ch; s+=(P.data[i]+P.data[i+1]+P.data[i+2])/3; n++; }
  return +(s/n).toFixed(2); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  let pass=0, fail=0;
  const ok=(c,msg,data)=>{ if(c){pass++; console.log('  ok   '+msg);} else {fail++; console.log('  FAIL '+msg+'  '+JSON.stringify(data||{}));} };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3500);
    // flat treeless ground, 5x5 of equal height (a 7x7 does not exist within 140 blocks of spawn)
    const site=await page.evaluate(`(()=>{ const P=__hc.probe();
      for(let r=10;r<220;r+=3) for(let a=0;a<24;a++){ const th=a*0.2618;
        const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g0=__hc.treeGates(x,z); const h=g0&&g0.h; if(h==null) continue;
        let flat=true, clear=true;
        for(let dx=-2;dx<=2&&flat;dx++)for(let dz=-2;dz<=2;dz++){ const gg=__hc.treeGates(x+dx,z+dz);
          if(!gg||gg.h!==h){ flat=false; break; } if(gg.emits) clear=false; }
        if(flat&&clear&&h>P.sea+3) return {x,z,h};
      } return {err:'no flat treeless site'}; })()`);
    if(site.err) throw new Error(site.err);
    console.log('site ' + JSON.stringify(site));
    // A 4x4x4 STONE BOX. Its -x wall and its -z wall are the pair: same block, same height, same hour, one frame.
    await page.evaluate(`(()=>{ for(let dx=0;dx<4;dx++) for(let dz=0;dz<4;dz++) for(let dy=1;dy<=4;dy++)
        __hc.setBlockAt(${site.x}+dx, ${site.h}+dy, ${site.z}+dz, 'stone'); })()`);
    await sleep(3000);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    // Stand off the box's -x/-z corner, level with its middle, so its -x wall fills the left of the frame and its -z wall
    // the right. Aim twice: look() reads camera.position and tpAt does not snap to the ground.
    const cam=[site.x-9, site.h+3, site.z-9], at=[site.x+2, site.h+2.5, site.z+2];
    const rows=[];
    for(const t of [0.10, 0.18, 0.25, 0.40]){
      await page.evaluate('__hc.setTime('+t+')');
      await page.evaluate('__hc.tpAt('+cam.join(',')+')');
      await sleep(1500);
      await page.evaluate('__hc.look('+at.join(',')+')');
      await sleep(800);
      await page.evaluate('__hc.look('+at.join(',')+')');
      await page.evaluate('__hc.setTime('+t+')'); await sleep(400);
      const f=path.join(ROOT,'bench','results','wallaz-'+String(t).replace('.','')+'.png');
      await page.screenshot({path:f});
      // left half of the box is its -x wall, right half its -z wall; the crops sit inside the silhouette
      const mx=luma(f, 250,150, 120,120), mz=luma(f, 430,150, 120,120);
      rows.push({t, negX:mx, negZ:mz});
      console.log('  t='+t+'   -x wall '+mx+'   -z wall '+mz);
    }
    const xs=rows.map(r=>r.negX), zs=rows.map(r=>r.negZ);
    const spread=a=>+(Math.max(...a)-Math.min(...a)).toFixed(2);
    console.log('  luma spread across the day:  -x '+spread(xs)+'   -z '+spread(zs));
    // THE INVARIANT: a wall that the sun crosses changes through the day. A wall the sun can never reach does not.
    ok(spread(xs)>6, 'the -x wall is lit differently at different hours (the sun crosses it)', {xs});
    ok(spread(zs)>6, 'the -z wall is lit differently at different hours - RED until the sunless-wall fix lands', {zs});
    console.log('\n'+pass+' ok, '+fail+' failed   frames bench/results/wallaz-*.png');
    process.exitCode = fail?1:0;
  } finally { await browser.close(); server.kill(); }
})();
