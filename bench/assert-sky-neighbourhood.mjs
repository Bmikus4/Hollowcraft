// Ben, 08-05, having found it himself: "certain blocks are dark at night and day ... IT IS ONLY blocks with a block
// somewhere above them directly, that become unaffected by lighting". The sky bake was a per-COLUMN heightfield, so
// anything with a block above it at any height ramped to sky 0 over six blocks whatever its sides were doing. The bake is
// now a 3x3 NEIGHBOURHOOD max, one rule for every face orientation.
//
// This asserts the new rule and all three things it could break, in one run, off ?dbg=sky (which paints vSky directly):
//   1. BEN'S CASE. Build a single block floating over open ground and read the ground under it. It must stay lit.
//   2. THE 1x1 SHAFT (29f8795) must still be dark at the bottom — walls AND floor.
//   3. A CAVE must still be black: all nine columns capped, nothing to rescue it.
//   4. OPEN GROUND must be untouched.
// node bench/assert-sky-neighbourhood.mjs
import { spawn, execSync } from 'node:child_process';
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
function grey(file,x0,y0,w,h){ const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const i=(y*P.w+x)*ch; s+=(P.data[i]+P.data[i+1]+P.data[i+2])/3; n++; }
  return +(s/n).toFixed(2); }

// `node bench/assert-sky-neighbourhood.mjs base` runs the identical measurements against the newest commit that predates
// the rule, which is what makes the "block above" assertion mean anything: the invariant has to FAIL there.
// Every hook it uses (setBlockAt, treeGates, tpAt, look) predates the change, so an old page can run it unmodified.
const BASE = process.argv[2]==='base';
const MARK='A BLOCK IS NOT DARK BECAUSE SOMETHING IS ABOVE IT';
(async()=>{
  let FILE='index.html';
  if(BASE){
    const refs=execSync('git log --format=%H -60',{cwd:ROOT}).toString().trim().split(String.fromCharCode(10));
    let base=null;
    for(const r of refs){ const src=execSync('git show '+r+':index.html',{cwd:ROOT,maxBuffer:64*1024*1024}).toString();
      if(!src.includes(MARK)){ base=r; fs.writeFileSync(path.join(ROOT,'_skyold.html'), src); break; } }
    if(!base) throw new Error('no commit in the last 60 without the marker');
    FILE='_skyold.html';
    console.log('BASELINE '+base.slice(0,7)+'  '+execSync('git log -1 --format=%s '+base,{cwd:ROOT}).toString().trim());
  }
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
    await page.goto('http://127.0.0.1:'+port+'/'+FILE+'?debug=1&dbg=sky',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3000);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const site=await page.evaluate(`(()=>{ const P=__hc.probe();
      for(let r=8;r<220;r+=3) for(let a=0;a<24;a++){ const th=a*0.2618;
        const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g0=__hc.treeGates(x,z); const h=g0&&g0.h; if(h==null) continue;
        let flat=true, clear=true;
        // 5x5, not 7x7: no 7x7 of perfectly equal height exists within 140 blocks of spawn (the first run of this
        // harness searched for one and died with 'no flat treeless site').
        for(let dx=-2;dx<=2&&flat;dx++)for(let dz=-2;dz<=2;dz++){ const gg=__hc.treeGates(x+dx,z+dz);
          if(!gg||gg.h!==h){ flat=false; break; } if(gg.emits) clear=false; }
        if(flat&&clear&&h>P.sea+3) return {x,z,h};
      } return {err:'no flat treeless site'}; })()`);
    if(site.err) throw new Error(site.err);
    console.log('site ' + JSON.stringify(site));
    // aim twice everywhere: look() reads camera.position and tpAt does not snap to the ground
    const shoot=async(tag, cam, at)=>{
      await page.evaluate('__hc.tpAt('+cam.join(',')+')');
      await sleep(1600);
      await page.evaluate('__hc.look('+at.join(',')+')');
      await sleep(900);
      await page.evaluate('__hc.look('+at.join(',')+')');
      await sleep(500);
      const f=path.join(ROOT,'bench','results','skynbr-'+tag+'.png');
      await page.screenshot({path:f});
      return f;
    };
    // ---- 4. OPEN GROUND, the reference every other number is read against ----
    const fOpen=await shoot('open', [site.x+6, site.h+3, site.z+6], [site.x, site.h+1, site.z]);
    const open=grey(fOpen, 250,150, 300,200);
    console.log('  open ground vSky ' + open);
    // NOT a full-sky threshold: this crop holds the horizon and the side faces of the ground it is looking across, so
    // even wide-open daylight reads ~120 here. What matters is that it is nothing like a shaft or a cave (~1).
    ok(open>90, 'open ground reads open', {open});
    // ---- 1. BEN'S CASE: one block floating six above open ground ----
    await page.evaluate(`(()=>{ __hc.setBlockAt(${site.x}, ${site.h+6}, ${site.z}, 'stone'); })()`);
    await sleep(2500);
    const fUnder=await shoot('under', [site.x+6, site.h+3, site.z+6], [site.x, site.h+1, site.z]);
    const under=grey(fUnder, 250,150, 300,200);
    console.log('  ground under a floating block vSky ' + under + '   (was ' + open + ' with nothing above it)');
    ok(under > open*0.8, 'a block six above open ground does not darken the ground under it', {open, under});
    await page.evaluate(`(()=>{ __hc.setBlockAt(${site.x}, ${site.h+6}, ${site.z}, 'air'); })()`);
    await sleep(2000);
    // ---- 2. THE 1x1 SHAFT still goes dark ----
    await page.evaluate(`(()=>{ for(let d=0;d<8;d++) __hc.setBlockAt(${site.x}, ${site.h}-d, ${site.z}, 'air'); })()`);
    await sleep(2500);
    const fWall=await shoot('shaft', [site.x+0.5, site.h-7, site.z+0.5], [site.x+4.5, site.h-6.5, site.z+0.5]);
    const wall=grey(fWall, 300,150, 200,150);
    const fFloor=await shoot('shaftfloor', [site.x+0.5, site.h-7, site.z+0.5], [site.x+0.5, site.h-9, site.z+0.5]);
    const floor=grey(fFloor, 300,150, 200,150);
    console.log('  1x1 shaft wall vSky ' + wall + '   floor ' + floor);
    ok(wall<25, 'the wall of a 1x1 shaft is still dark', {wall});
    ok(floor<25, 'the floor of a 1x1 shaft is still dark', {floor});
    // ---- 3. A CAVE is still black. Dig a 1-high tunnel 8 blocks sideways under the surface and stand at its end ----
    await page.evaluate(`(()=>{ for(let k=1;k<=8;k++) __hc.setBlockAt(${site.x}+k, ${site.h}-7, ${site.z}, 'air'); })()`);
    await sleep(2500);
    const fCave=await shoot('cave', [site.x+7.5, site.h-7, site.z+0.5], [site.x+8.9, site.h-6.6, site.z+0.5]);
    const cave=grey(fCave, 300,150, 200,150);
    console.log('  cave end-wall vSky ' + cave);
    ok(cave<25, 'the far end of an 8-block tunnel is still black', {cave});
    console.log('\n'+pass+' ok, '+fail+' failed');
    process.exitCode = fail?1:0;
  } finally { await browser.close(); server.kill(); if(BASE){ try{ fs.unlinkSync(path.join(ROOT,'_skyold.html')); }catch(e){} } }
})();
