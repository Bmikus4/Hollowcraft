// THE MID-DISTANCE RED, ONE ATTEMPT. Ben's 05:21 frame: the grass at his feet is green and the terraces about
// twenty blocks out glow red-orange, at night, outside the cabin with a light in hand.
//
// THE FOG IS ALREADY OUT, BY READING RATHER THAN BY A RUN. At midnight `fogDay` is ~0, so the fog colour is
// (0.0018, 0.0022, 0.0034) — black with a hair of blue — and the grazing warmth term that could redden it is
// gated on `smooth(-0.10, 0.02, elev)`, which is exactly 0 with the sun a shade under the horizon. A term that
// is zero cannot be the cast, and 4e7a9e1 already showed the grade is not it either (neutralising sat/warm/temp
// moved every band by <= 0.02).
//
// SO THE QUESTION IS WHICH LIGHT, AND IT IS ASKED BY REMOVAL, one term at a time, at ONE vantage, measured in
// DISTANCE BANDS. That is the whole design: the fault is distance-weighted — green near, red at twenty blocks —
// so a single number for the frame would average the fault away with the thing it is being compared against.
// The rows are the same A/B that convicted the point light on the shore in 6632ee1 (empty 21/+0.05, torch
// 54/+0.23, volume off 55/+0.32, point light off 21/+0.05), pointed at the range where the red actually lives.
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

// Warmth (r-b)/(r+b) in horizontal bands down the frame. With the camera level and pitched slightly down, a band
// index IS a distance: the lower the band, the closer the ground in it. Ben's fault is a band that is warm while
// the one below it is not.
const BANDS=(page,f)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data, out=[];
  for(let b=0;b<6;b++){ const y0=(H*(0.35+b*0.10))|0, y1=(H*(0.45+b*0.10))|0; let r=0,gg=0,bb=0,n=0;
    for(let y=y0;y<Math.min(H,y1);y++)for(let x=(W*0.15)|0;x<W*0.85;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; bb+=d[i+2]; n++; }
    r/=n; gg/=n; bb/=n;
    out.push(+((r-bb)/Math.max(1e-4,r+bb)).toFixed(3)); }
  return out;
}, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(8000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    // HIS VANTAGE: outside the cabin, at night, light in hand, looking at the ground that runs away from him.
    const C=await page.evaluate('__hc.cabinInfo()');
    await page.evaluate(`__hc.tp(${C.cx},${C.cz+10})`); await sleep(2500);
    for(let i=0;i<60;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate('__hc.dayLock(0.75)'); await sleep(2000);
    await page.evaluate(`__hc.look(${C.cx},${C.gy+1},${C.cz+40})`); await sleep(1200);
    console.log('  vantage:', JSON.stringify(C), ' hour: midnight');

    const row=async(tag,pre)=>{ if(pre) await page.evaluate(pre); await sleep(2200);
      const f=path.join(OUT,'redcast-'+tag.replace(/[^a-z0-9]/gi,'_')+'.png'); await page.screenshot({path:f});
      const b=await BANDS(page,f);
      console.log('    '+tag.padEnd(26)+' warmth by band, near->far: '+b.map(v=>String(v).padStart(7)).join(' ')); };

    console.log('\n  === warmth (r-b)/(r+b) by distance band, one term removed at a time ===');
    await page.evaluate('__hc.hold("torch")'); await sleep(1500);
    await row('torch in hand (shipped)');
    await row('point light off','__hc.handAB({pl:0})');
    await row('point light back','__hc.handAB({pl:1})');
    await row('volumetric term off','__hc.handAB({vol:0})');
    await row('volumetric back','__hc.handAB({vol:1})');
    await row('empty hand','__hc.hold("stick")');
    await row('torch again (baseline)','__hc.hold("torch")');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
