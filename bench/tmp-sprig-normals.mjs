// Ben 08-05: "the lighting on trees does not look right any more, the lighting on the foliage on the outside of trees
// especially". The sprig pass stamped a MOSTLY-UP normal on every quad — grass's normal, because quad() was grass's
// helper — so the fringe of a canopy took the same overhead N·L on the sunward side and the shaded side of every tree.
// A tree with no lit side is a tree with no form.
//
// THE MEASUREMENT IS THE DIFFERENCE BETWEEN TWO SIDES OF ONE TREE, at a pinned sun. Stand west of a canopy, shoot it;
// stand east, shoot it. With the up-normal the two frames' foliage luma agree; with the face normal the sunward side is
// brighter than the shaded one. A single side proves nothing — the whole frame moves with exposure and fog.
// __hc.sprigNormals(false|true) remeshes the world either way, so both arms are one page, one camera, one sun.
// node bench/tmp-sprig-normals.mjs
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

// mean luma of the GREEN pixels only: sky, trunk and ground would swamp a whole-frame average, and the foliage is what
// changed. Frame above the HUD.
function greenLuma(file){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0;
  for(let y=0;y<440;y++) for(let x=0;x<P.w;x++){
    const i=(y*P.w+x)*ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    if(g>r && g>b){ s+=(r+g+b)/3; n++; }
  }
  return { luma:n?+(s/n).toFixed(2):null, greenPx:n };
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
    // MID-MORNING, not noon: at noon the sun is overhead and an up-normal and a side-normal receive nearly the same
    // light, so the very difference under test is smallest exactly where a "noon" default would put it. Not dawn either
    // — at 0.10 the whole scene sits at luma 7-11 and every number is in the dither.
    const TIME=0.18;
    await page.evaluate('__hc.setTime('+TIME+')');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    console.log('tree ' + JSON.stringify(spot) + '   sun pinned at ' + TIME);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const shot=async(dx,dz,tag)=>{
      await page.evaluate('__hc.tpAt('+(spot.x+dx)+','+(spot.h+11)+','+(spot.z+dz)+')');
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
      await sleep(2500); await page.evaluate('__hc.setTime('+TIME+')');
      await page.evaluate('__hc.look('+spot.x+','+(spot.h+10)+','+spot.z+')');
      await sleep(1200); await page.evaluate('__hc.setTime('+TIME+')'); await sleep(300);
      const f=path.join(ROOT,'bench','results','sprig-n-'+tag+'.png');
      await page.screenshot({ path:f });
      return greenLuma(f);
    };
    const arm=async(on,tag)=>{
      console.log('  ' + tag + ' ' + JSON.stringify(await page.evaluate('__hc.sprigNormals('+on+')')));
      await sleep(2000);
      // EVERY SIDE TWICE, AND THE SECOND ONE COUNTS. The first frame after a dial+remesh reads 7 luma units bright —
      // more than the entire effect under test — because the chunk stream and the relight are still settling. Two
      // passes over the same four sides, and the spread is computed from the settled pass only.
      for(const s2 of [[-16,0],[16,0],[0,-16],[0,16]]) await shot(s2[0],s2[1],tag+'-warm');
      const west=await shot(-16,0,tag+'-west'), east=await shot(16,0,tag+'-east');
      const north=await shot(0,-16,tag+'-north'), south=await shot(0,16,tag+'-south');
      const v=[west.luma,east.luma,north.luma,south.luma];
      return { tag, west, east, north, south, spread:+(Math.max(...v)-Math.min(...v)).toFixed(2) };
    };
    // WARM UP BEFORE THE FIRST ARM. The first run of this harness reported sprigNormals(false) with remeshed:0 — no
    // chunk was meshed yet, so the dial changed nothing and the arm measured the DEFAULT build. Its 4.35 spread was a
    // measurement of the other arm.
    await shot(-16,0,'warmup');
    const off=await arm(false,'up');
    const on =await arm(true ,'face');
    const off2=await arm(false,'up2');
    console.log('\nRESULT  mean luma of the green pixels, one tree from four sides');
    for(const r of [off,on,off2]) console.log('  '+r.tag.padEnd(5)+'  W '+String(r.west.luma).padStart(6)+'  E '+String(r.east.luma).padStart(6)+
      '  N '+String(r.north.luma).padStart(6)+'  S '+String(r.south.luma).padStart(6)+'   spread '+r.spread);
    console.log('  side-to-side spread: ' + off.spread + ' / ' + off2.spread + ' (up normal) -> ' + on.spread + ' (face normal)');
  } finally { await browser.close(); server.kill(); }
})();
