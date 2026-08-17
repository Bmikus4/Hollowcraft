// WHAT IS THE CREAM. At dusk on the shore the sand, the sea and the sky are one pale colour and the sun's track has
// nothing to sit against. Lowering the clear-air fog's own brightness moved the strip by 0.1 of a luminance level, so
// the wash is not scene.fog and no more of it should be tuned until the thing actually painting it is named.
// Four shots from ONE camera at dusk, each with one suspect removed: the far-sea disc, the time-of-day grade, the
// bloom, and the god rays. Whichever one takes the cream out is the answer.
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

// FOREGROUND, not the whole strip: the cream sheet is the bottom third of the frame, which is where the beach and the
// near water are. The HUD corner is excluded — it is bright, coloured and 20% of that band.
const FG=async(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
  const box=(x0,x1,y0,y1)=>{ let r=0,gg=0,bb=0,n=0,mn=999,mx=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; bb+=d[i+2]; n++;
      const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; if(l<mn)mn=l; if(l>mx)mx=l; }
    r/=n; gg/=n; bb/=n;
    return { lum:+(0.2126*r+0.7152*gg+0.0722*bb).toFixed(1), warmth:+((r-bb)/Math.max(1e-4,r+bb)).toFixed(3), range:+(mx-mn).toFixed(0) }; };
  return { fg:box(Math.floor(W*0.30),W,Math.floor(H*0.72),H), sea:box(Math.floor(W*0.20),Math.floor(W*0.80),Math.floor(H*0.50),Math.floor(H*0.70)),
           sky:box(0,W,0,Math.floor(H*0.40)) };
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
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(16000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    const prof=await page.evaluate('__hc.shoreProfile(36,2)');
    const f=0.485, ang=f*Math.PI*2, sx=Math.cos(ang), sz=0.35;
    const want=Math.atan2(sz,sx)*180/Math.PI;
    const b=prof.perBearing.reduce((a,o)=>{ const dd=x=>Math.abs(((x-want)%360+540)%360-180);
      return dd(o.bearing)<dd(a.bearing)?o:a; }, prof.perBearing[0]);
    const th=b.bearing*Math.PI/180, cs=Math.cos(th), sn=Math.sin(th);
    await page.evaluate('__hc.dayLock('+f+')');
    await page.evaluate('__hc.tp('+Math.round(500+cs*(b.coast-6))+','+Math.round(0+sn*(b.coast-6))+')'); await sleep(8000);
    await page.evaluate('__hcBR.look('+Math.atan2(-cs,-sn).toFixed(4)+',-0.05)'); await sleep(2500);
    const shoot=async(tag,pre)=>{
      if(pre) console.log('  pre:', JSON.stringify(await page.evaluate(pre).catch(e=>({err:String(e.message||e).slice(0,120)}))).slice(0,150));
      await sleep(2500);
      const file=path.join(OUT,'dusk-'+tag+'.png'); await page.screenshot({path:file});
      const r=await FG(page,file);
      console.log('== '+tag.padEnd(14)+' fg lum '+String(r.fg.lum).padStart(6)+' warm '+String(r.fg.warmth).padStart(6)+' range '+String(r.fg.range).padStart(4)
        +'  | sea lum '+String(r.sea.lum).padStart(6)+' warm '+String(r.sea.warmth).padStart(6)
        +'  | sky lum '+String(r.sky.lum).padStart(6));
    };
    await shoot('shipped',null);
    await shoot('noFarSea','__hc.farSeaOn(0)');
    await shoot('noGrade','(__hc.farSeaOn(1), __hc.grade({sat:1,warm:0,temp:0,vib:0,curve:0}))');
    await shoot('noRays','(__hc.grade("shipped"), __hc.tod({release:1}), __hc.godrays?__hc.godrays({amt:0}):"no godray hook")');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
