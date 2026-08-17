// WHERE IS THE RED-BROWN AT NIGHT. Lock the clock at midnight, stand on open ground, and measure the WARMTH
// (R-B)/(R+B) of the frame band by band from the zenith down to the ground — Ben's tell is that the part of the sky
// furthest from the horizon is the part that looks right, so a cast that is flat across bands is a grade and a cast
// that grows toward the horizon is an atmospheric term.
// A/B: the same camera with the grade neutralised (sat 1, warm 0, temp 0). If the cast survives that, it is in the scene.
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

// PNG decoded in the page, not read back off the WebGL canvas — a canvas readback of the game's own buffer is all
// black (cleared after present), which is how two earlier lighting claims were made against nothing.
const BANDS=async(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
  const out=[];
  for(let b=0;b<6;b++){ const y0=Math.floor(H*b/6), y1=Math.floor(H*(b+1)/6);
    let r=0,gg=0,bb=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=0;x<W;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; bb+=d[i+2]; n++; }
    r/=n; gg/=n; bb/=n;
    out.push({ band:b, r:+r.toFixed(1), g:+gg.toFixed(1), b:+bb.toFixed(1),
               lum:+(0.2126*r+0.7152*gg+0.0722*bb).toFixed(1),
               warmth:+((r-bb)/Math.max(1e-4,r+bb)).toFixed(3) }); }
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
    // MIDNIGHT IS 0.75. elev = sin(2*pi*f), so 0.0 is sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. dayLock pins
    // worldTime itself; setTime alone drifts, and freezeT only pins the SHADER clock.
    const shoot=async(tag,frac,pre)=>{
      await page.evaluate('__hc.dayLock('+frac+')'); await sleep(1500);
      if(pre) await page.evaluate(pre).catch(e=>console.log('pre failed',tag,String(e).slice(0,120)));
      await sleep(1200);
      await page.evaluate('__hc.freezeT(12.0)').catch(()=>{});
      const f=path.join(OUT,'nightcast-'+tag+'.png');
      await page.screenshot({path:f});
      const bands=await BANDS(page,f);
      const tod=await page.evaluate('JSON.stringify(__hc.tod())').catch(()=>'{}');
      console.log('\n== '+tag+'  (dayLock '+frac+')   tod '+tod);
      for(const b of bands) console.log('   band'+b.band+'  rgb '+String(b.r).padStart(6)+String(b.g).padStart(7)+String(b.b).padStart(7)+'   lum '+String(b.lum).padStart(6)+'   warmth '+b.warmth);
      return bands;
    };
    // look slightly down at the horizon so the frame is half sky, half ground
    await page.evaluate('__hcBR.look(0.6,-0.06)').catch(()=>{}); await sleep(1500);
    for(const f of [0.44,0.48,0.50,0.52,0.55,0.58,0.62,0.68,0.75,0.86,0.92,0.96])
      await shoot('h'+String(f).replace('.',''),f,null);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
