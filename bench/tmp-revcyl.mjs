// CAN YOU SEE BRASS IN THE CHAMBERS. Ben, three times now, most recently "i still cant see bullets in revolver holes".
// The cases are built (GLB_GUNS.revolver.cyl) and the numbers came off the mesh, so the question is not whether the
// geometry exists but whether it reads at the size the gun is actually drawn — and a full frame at 1100x620 puts the
// whole revolver in about 200 pixels, which is too small to answer it either way.
// So this crops the held gun out of the frame and scales it up, which is the only honest way to look at a viewmodel
// detail. Also shoots the two revolvers that declare NO cylinder at all, because if they are empty that is the answer.
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

const ZOOM=async(page,src,dst,x0,y0,w,h,k)=>{
  const b64=await page.evaluate(async(a)=>{
    const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=a.src; });
    const c=document.createElement('canvas'); c.width=a.w*a.k; c.height=a.h*a.k;
    const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
    g.drawImage(img, a.x0, a.y0, a.w, a.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  }, { src:'data:image/png;base64,'+fs.readFileSync(src).toString('base64'), x0, y0, w, h, k });
  fs.writeFileSync(dst, Buffer.from(b64,'base64'));
};

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1400,height:800}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(16000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.25)');
    await page.evaluate('__hcBR.look(0.6,-0.35)').catch(()=>{});   // look DOWN at the gun, which is how you inspect one
    for(const id of ['revolver','revolver_snub','revolver_rail']){
      const g=await page.evaluate('__hc.cmdRun("/give @me '+id+' 1")').catch(e=>String(e).slice(0,80));
      await page.evaluate('__hc.sel(0)'); await sleep(3000);
      const held=await page.evaluate('JSON.stringify((()=>{const o=__hc.blockOut(); return {id:o.id};})())').catch(()=>'?');
      const raw=path.join(OUT,'rev-'+id+'-full.png');
      await page.screenshot({path:raw});
      // the held gun lives in the lower right quadrant; 3x with smoothing off so a two-pixel rim stays two pixels
      await ZOOM(page, raw, path.join(OUT,'rev-'+id+'.png'), 800, 380, 500, 380, 3);
      console.log('== '+id+'  held '+held+'   give '+JSON.stringify(g).slice(0,60));
      await page.evaluate('__hc.cmdRun("/clear")').catch(()=>{});
      await sleep(800);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
