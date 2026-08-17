// IS THE RED-BROWN NIGHT THE THING IN YOUR HAND? A clean midnight frame at this spawn measures COOL (sky warmth
// -0.30, ground +0.045), so the cast Ben photographs is not in the world's own night. The held torch is the
// candidate: hcHeldGlow multiplies uHeldC (1.00,0.60,0.22) by 3.6 with NO occlusion and no N.L, over the lamp's
// whole range, so everything within reach goes orange whatever is between it and the flame.
// Three frames from one camera at midnight: empty hand, torch, flashlight.
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

const BANDS=async(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
  const out=[];
  // top half = sky, bottom half MINUS the HUD corner = world. The HUD is bright and coloured and it was 20% of the
  // earlier ground band, which is enough to move a warmth reading on its own.
  const box=(x0,x1,y0,y1,name)=>{ let r=0,gg=0,bb=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; bb+=d[i+2]; n++; }
    r/=n; gg/=n; bb/=n;
    out.push({ name, r:+r.toFixed(1), g:+gg.toFixed(1), b:+bb.toFixed(1),
      lum:+(0.2126*r+0.7152*gg+0.0722*bb).toFixed(1), warmth:+((r-bb)/Math.max(1e-4,r+bb)).toFixed(3) }); };
  box(0,W,0,Math.floor(H*0.42),'sky');
  box(Math.floor(W*0.30),W,Math.floor(H*0.52),H,'ground');
  box(Math.floor(W*0.36),Math.floor(W*0.64),Math.floor(H*0.55),Math.floor(H*0.85),'underfoot');
  return out;
}, 'data:image/png;base64,'+fs.readFileSync(file).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(9000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.75)');
    await page.evaluate('__hcBR.look(0.6,-0.20)').catch(()=>{});
    await sleep(16000);   // one full warm-up: the FIRST shot after a load is a frame the world has not drawn into yet
    const shoot=async(tag,pre)=>{
      if(pre) console.log('  pre:', JSON.stringify(await page.evaluate(pre).catch(e=>({err:String(e).slice(0,140)}))));
      await sleep(2500);
      const f=path.join(OUT,'held-'+tag+'.png');
      await page.screenshot({path:f});
      const bx=await BANDS(page,f);
      console.log('== '+tag);
      for(const b of bx) console.log('   '+b.name.padEnd(10)+' rgb '+String(b.r).padStart(6)+String(b.g).padStart(7)+String(b.b).padStart(7)+'   lum '+String(b.lum).padStart(6)+'   warmth '+b.warmth);
      const u=await page.evaluate('JSON.stringify(__hc.lightParams().held)').catch(e=>'{}');
      console.log('   held '+u);
    };
    await shoot('empty',null);
    await shoot('torch','(__hc.cmdRun("/give @me torch 1"), __hc.sel(0))');
    await shoot('torch-reach100','__hc.lampReach(1.0)');
    await shoot('torch-reach35','__hc.lampReach(0.35)');
    await page.evaluate('__hc.lampReach(0.55)');
    await shoot('flashlight','(__hc.cmdRun("/give @me flashlight 1"), __hc.sel(1))');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
