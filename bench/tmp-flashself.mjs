// DOES THE FLASHLIGHT LIGHT ITS OWN MODEL. Every flashlight frame taken before this one was of a lamp that was not
// switched on — the switch is a keydown behind the pointer-lock guard, which a headless page cannot reach, so
// __hc.flashOn(1) exists now and this is the first frame of the beam actually running.
// Two things are measured and they are different questions. The VIEWMODEL crop (bottom right, where the held item
// lives) says whether the lamp is blowing out the thing it is bolted to. The WALL crop says whether the beam still
// lights the world — a self-exclusion that also puts the beam out is not a fix.
// Shot at midnight so nothing else is lighting either crop.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

const CROPS=async(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
  const box=(x0,x1,y0,y1)=>{ let s=0,n=0,white=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=(y*W+x)*4;
      const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s+=l; n++; if(l>235)white++; }
    return { lum:+(s/n).toFixed(1), pctWhite:+(100*white/n).toFixed(2) }; };
  return { vm:box(Math.floor(W*0.55),W,Math.floor(H*0.62),H),            // the held item's corner — WIDE enough to hold a rifle's barrel, not just its butt
           wall:box(Math.floor(W*0.28),Math.floor(W*0.62),Math.floor(H*0.30),Math.floor(H*0.60)) };
}, 'data:image/png;base64,'+fs.readFileSync(file).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const run=async(qs,label)=>{
    const base='http://127.0.0.1:'+port;
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10'+qs,{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(16000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.75)');
    // A RIFLE WITH THE LIGHT ON ITS RAIL, not a handheld torch. The handheld case is already covered by putting the
    // lamp 0.45 down the beam — a spot lights nothing behind its origin, and the whole flashlight model is behind it.
    // A suppressed rifle is not: its barrel runs the better part of a metre PAST the lens, in the cone, at 1/d2.
    await page.evaluate('__hc.cmdRun("/give @me ar15 1")');
    await page.evaluate('__hc.cmdRun("/give @me weapon_light 1")');
    await page.evaluate('__hc.sel(0)'); await sleep(2000);
    console.log('   fit:', JSON.stringify(await page.evaluate('__hc.fitAtt("light","weapon_light")').catch(e=>String(e.message||e).slice(0,120))));
    await sleep(2500);
    // a wall four blocks out, so the beam has something to land on that is not the gun
    await page.evaluate('(()=>{ for(let dy=0;dy<4;dy++) for(let dx=-3;dx<=3;dx++) __hc.setBlock(dx,dy,-4,"cobble"); })()');
    await sleep(3000);
    const shoot=async(on)=>{
      console.log('   '+label+(on?' ON  ':' OFF ')+JSON.stringify(await page.evaluate('__hc.flashOn('+(on?1:0)+')')));
      await sleep(2600);
      const f=path.join(OUT,'flash-'+label+(on?'-on':'-off')+'.png'); await page.screenshot({path:f});
      const r=await CROPS(page,f);
      console.log('== '+(label+(on?'-on':'-off')).padEnd(16)+'  viewmodel lum '+String(r.vm.lum).padStart(6)+'  white% '+String(r.vm.pctWhite).padStart(6)
        +'   |  wall lum '+String(r.wall.lum).padStart(6)+'  white% '+String(r.wall.pctWhite).padStart(6));
    };
    await shoot(false); await shoot(true);
    await browser.close();
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    await run('&vmeye=0&vmbouncer=1.3','noeye');   // neither lever: the weapon in its own beam as it was
    await run('','shipped');
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
