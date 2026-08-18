// THE HORIZON RULER, photographed. Four bearings from one shore vantage, so the numbers can be read and
// checked against the yaw the camera was actually set to.
//   node bench/tmp-hzruler.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// The red band's rows, so "it lands on the horizon" is a number and not an impression.
async function redRows(page,file){
  const buf=fs.readFileSync(file).toString('base64');
  return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
    await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,im.width,im.height).data;
    const W=im.width,H=im.height; let top=-1,bot=-1,n=0;
    for(let y=0;y<H;y++){ let row=0;
      for(let x=0;x<W;x++){ const i=(y*W+x)*4;
        if(d[i]>150 && d[i]-d[i+1]>60 && d[i]-d[i+2]>60) row++; }
      if(row>W*0.30){ if(top<0) top=y; bot=y; n+=row; } }
    return { top, bot, px:n }; })()`);
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10&hzruler=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);
    console.log('ruler', JSON.stringify(await page.evaluate('__hc.hzRuler()')));

    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const shore=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){
        const x=Math.round(${IC.x}-d), z=${IC.z};
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
    await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${shore.g}+1, ${shore.z}+0.5);`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    for(const yaw of [0, 1.5708, 3.1416, -1.5708]){
      await page.evaluate('__hc.cam({yaw:'+yaw+', pitch:0});'); await sleep(900);
      const tag='yaw'+Math.round(yaw*180/Math.PI);
      const f=path.join(OUT,`hzruler-${tag}.png`); await page.screenshot({path:f});
      const r=await redRows(page,f);
      console.log(`  ${tag.padEnd(8)} redBand rows ${r.top}..${r.bot}  px ${r.px}  -> ${path.basename(f)}`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
