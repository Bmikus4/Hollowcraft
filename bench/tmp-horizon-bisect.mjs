// WHICH LAYER DRAWS THE BRIGHT BAND AT THE DAYTIME HORIZON. Four meshes stack at the sea line — sky dome, ocean backdrop
// ring, pine silhouette, weather fog shell — plus the real water geometry. I have now changed the ring colour, the sky's
// anchor mask and the water's grazing sheen, and the band has not moved, which means every one of those guesses was wrong.
// So: hide one layer at a time and measure the band directly. The band is a bright ROW, so the metric is the brightest row
// in the horizon region and how far it stands above the rows around it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// brightest row in the middle band, its luminance, and how much it exceeds the median row there
async function bandStat(page){
  const png=(await page.screenshot({type:'png'})).toString('base64');
  return await page.evaluate(async (png)=>{
    const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
    const g=cv.getContext('2d'); g.drawImage(img,0,0);
    const y0=Math.round(img.height*0.36), y1=Math.round(img.height*0.62);
    // SATURATION, not luminance. The band is slightly DARKER than the sky above it and far more colourful — every
    // brightness metric walked straight past it. Chroma is the quantity that describes "neon".
    const d=g.getImageData(0,y0,img.width,y1-y0).data, W=img.width, rows=[];
    for(let r=0;r<(y1-y0);r++){ let s=0, l=0;
      for(let x=0;x<W;x++){ const i=(r*W+x)*4, R=d[i],G=d[i+1],B=d[i+2], mx=Math.max(R,G,B), mn=Math.min(R,G,B);
        s+= (mx-mn); l+=R*0.2126+G*0.7152+B*0.0722; }   // ABSOLUTE chroma. Normalised saturation is 1.0 for any near-black blue pixel, so it ranked the dark water above a neon band; "neon" is a lot of colour at a middling brightness, which is max-min in 0..255
      rows.push({sat:s/W, lum:l/W/255}); }
    const sortedS=rows.map(r=>r.sat).slice().sort((a,b)=>a-b), medS=sortedS[Math.floor(sortedS.length/2)];
    let mx=0, at=0; for(let i=0;i<rows.length;i++) if(rows[i].sat>mx){ mx=rows[i].sat; at=i; }
    const px=[]; for(let x=Math.round(W*0.35); x<Math.round(W*0.65); x+=17){ const i=(at*W+x)*4; px.push([d[i],d[i+1],d[i+2]]); }
    const avg=px.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>Math.round(v/px.length));
    return { peakSat:+mx.toFixed(4), medianSat:+medS.toFixed(4), excess:+(mx-medS).toFixed(4),
             atRow:y0+at, rgb:avg, lumThere:+rows[at].lum.toFixed(4) };
  }, png);
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`__hc.aim(false)`);
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    const now=await page.evaluate(`__hc.time()`); const DAY_LEN=now.frac>0.001? now.worldTime/now.frac : 600;
    await page.evaluate(`__hc.time(${0.3*DAY_LEN})`); await sleep(900);
    await page.evaluate(`(()=>{ const p=__hc.pos(); __hc.look(p.x-400,p.y,p.z); })()`); await sleep(900);

    const cases=[
      ['everything on',        {sky:true, ocean:true, pines:true, shell:true}],
      ['ocean ring hidden',    {ocean:false}],
      ['ring back, pines off', {ocean:true, pines:false}],
      ['pines back, sky off',  {pines:true, sky:false}],
      ['sky back, shell off',  {sky:true, shell:false}],
    ];
    for(const [label,cfg] of cases){
      await page.evaluate(`__hc.layers(${JSON.stringify(cfg)})`); await sleep(700);
      const st=await bandStat(page);
      await page.screenshot({path:path.join(OUT,'hzb-'+label.replace(/[^a-z0-9]+/gi,'-')+'.png')});
      console.log(label.padEnd(24), JSON.stringify(st));
    }
    await page.evaluate(`__hc.layers({sky:true,ocean:true,pines:true,shell:true})`);
    await browser.close();
  } finally { server.kill(); }
})();
