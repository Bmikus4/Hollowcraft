// Where is the water in the measurement frame? Prints per-cell mean and variance of a 4x4 grid over the
// down-looking river shot, glade off, so the correlation crop can be aimed at textured water instead of at a
// flat dark patch (a near-uniform crop makes every offset score alike and the search picks a boundary).
// node bench/tmp-flow-crop.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:ARGS });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.30)'); await sleep(2500);
    const cen=await page.evaluate('__hc.flowCensus()');
    console.log('river ' + JSON.stringify(cen.river));
    await page.evaluate('__hc.stillFrame(true); __hc.glade({amt:0})');
    for(const H of [8,16,26]){
      await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+H}, ${cen.river.z+0.5})`); await sleep(1600);
      await page.evaluate(`__hc.look(${cen.river.x+0.51}, ${cen.river.h-10}, ${cen.river.z+0.51})`); await sleep(1600);
      const buf=await page.screenshot();
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-crop-h'+H+'.png'), buf);
      const {w,h,ch,data}=decodePNG(buf);
      const rows=[];
      for(let gy=0;gy<4;gy++){ const line=[];
        for(let gx=0;gx<4;gx++){ let s=0,s2=0,n=0;
          const x0=Math.round(w*(0.12+gx*0.19)), y0=Math.round(h*(0.10+gy*0.19)), S=Math.round(h*0.17);
          for(let y=y0;y<y0+S;y+=3) for(let x=x0;x<x0+S;x+=3){ const i=(y*w+x)*ch, v=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; s+=v; s2+=v*v; n++; }
          const m=s/n, sd=Math.sqrt(Math.max(0,s2/n-m*m));
          line.push(`(${(0.12+gx*0.19+0.085).toFixed(2)},${(0.10+gy*0.19+0.085).toFixed(2)}) m${m.toFixed(0)} sd${sd.toFixed(1)}`); }
        rows.push(line.join('  ')); }
      console.log('H='+H+'\n  '+rows.join('\n  '));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
