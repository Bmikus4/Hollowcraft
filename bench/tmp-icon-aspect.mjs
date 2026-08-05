// Judge the 3D icon bake on the items it was failing: the ICBM (4.5:1) and the guns (also long). Renders each icon at bake size
// and reports how much of the frame it fills and how bright it is, then writes a strip so it can be looked at.
// The bake fits an item's LONGEST axis, so slender items were coming out as slivers — this measures fill, not opinion.
//   node bench/tmp-icon-aspect.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const IDS=(process.argv[2]||'icbm,hunting_rifle,shotgun,launch_console,sandbag,concrete').split(',');
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await sleep(2000);
    // Read each icon's data URL straight out of the bake and measure the pixels: coverage (how much of the square is the object)
    // and the mean luminance of the covered pixels (is it lit or is it a silhouette).
    const out=await page.evaluate(`(async(ids)=>{
      const res=[];
      for(const id of ids){
        let url=null; try{ url=__hc.iconURLFor?__hc.iconURLFor(id):null; }catch(e){}
        if(!url) { res.push({id, err:'no hook'}); continue; }
        const img=new Image(); img.src=url; await img.decode();
        const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
        const x=c.getContext('2d'); x.drawImage(img,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data;
        let cov=0, lum=0, n=0;
        for(let i=0;i<d.length;i+=4){ if(d[i+3]>24){ cov++; lum+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; n++; } }
        res.push({ id, w:c.width, h:c.height, coverPct:+(100*cov/(c.width*c.height)).toFixed(1), meanLum:n?+(lum/n).toFixed(1):0, url });
      }
      return res;
    })(${JSON.stringify(IDS)})`);
    const strip=[];
    for(const r of out){
      console.log('  '+String(r.id).padEnd(18)+(r.err?('ERR '+r.err):('cover '+String(r.coverPct).padStart(5)+'%   mean luma '+String(r.meanLum).padStart(6))));
      if(r.url) strip.push('<img src="'+r.url+'" style="width:96px;height:96px;image-rendering:pixelated;background:#1a1a1a;margin:4px">');
    }
    if(strip.length){
      await page.setContent('<body style="margin:0;background:#111;display:flex">'+strip.join('')+'</body>');
      await page.screenshot({path:path.join(ROOT,'bench','results','icon-strip.png'), clip:{x:0,y:0,width:Math.min(900,strip.length*104+8), height:112}});
      console.log('  strip -> bench/results/icon-strip.png');
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
