// THE SEA'S NEW LOOK, AND WHETHER THE OUTER PLANE FOLLOWS IT (Ben 08-05).
// Three vantages, because the water is three different things: looking DOWN into it (the body colour), ALONG it (the grazing
// reflection), and at the SEA LINE (where the near water, the far plane and the sky band all have to agree). Old palette against
// new, from one page, so the sun and the clock cannot differ between them.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function band(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; R+=P.data[i]; G+=P.data[i+1]; B+=P.data[i+2]; n++; }
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2) };
}
// The sea line, row by row: the step across it is what "the outer plane reflects the change" has to survive.
function rows(file,x0f,x1f,y0f,y1f){
  const P=decodePNG(fs.readFileSync(file)); const out=[];
  const x0=(P.w*x0f)|0,x1=(P.w*x1f)|0;
  for(let y=(P.h*y0f)|0; y<(P.h*y1f)|0; y+=2){ let s=0,n=0;
    for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
    out.push(+(s/n).toFixed(1)); }
  return out;
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    // OVER OPEN WATER, well off the coast, so the near water in frame is real chunk water and the far plane fills the distance.
    const W=await page.evaluate(`(function(){ var Wb=__hc.bid('water');
      for(var a=0;a<24;a++){ var th=a*Math.PI/12;
        for(var d=40; d<=260; d+=4){ var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d), run=0;
          for(var k=0;k<8;k++){ var xx=Math.round(x+Math.cos(th)*k*3), zz=Math.round(z+Math.sin(th)*k*3), wet=false;
            for(var y=38;y<=42;y++) if(__hc.blockAt(xx,y,zz)===Wb){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=8) return {x:x,z:z,th:th,d:d}; } }
      return null; })()`);
    if(!W){ console.log('no open water found'); return; }
    console.log(`  open water at ${JSON.stringify(W)}`);
    await page.evaluate(`__hc.tpAt((${W.x})+Math.cos(${W.th})*26, 44, (${W.z})+Math.sin(${W.th})*26)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    await pin(0.30);   // mid-afternoon: the sun is up but not overhead, which is where water reads
    const OLD='__hc.seaLook({body:[0.002,0.008,0.012], far:[0.008,0.055,0.27], horizon:[0.0234,0.0390,0.0702]})';
    const NEW='__hc.seaLook({body:[0.004,0.034,0.052], far:[0.010,0.075,0.205], horizon:[0.0206,0.0422,0.0624]})';
    for(const [tag,js] of [['old',OLD],['new',NEW]]){
      console.log(`  ${tag}: ${JSON.stringify(await page.evaluate(js))}`);
      for(const [vname,pitch] of [['down',-0.95],['along',-0.10],['line',-0.02]]){
        await page.evaluate(`__hc.cam({yaw:${W.th}, pitch:${pitch}})`); await sleep(280); await pin(0.30);
        const f=path.join(OUT,`sealook-${tag}-${vname}.png`); await page.screenshot({path:f});
        if(vname==='down')  console.log(`    down  body  ${JSON.stringify(band(f,[0.30,0.70,0.45,0.70]))}`);
        if(vname==='along') console.log(`    along near  ${JSON.stringify(band(f,[0.30,0.70,0.60,0.80]))}   far ${JSON.stringify(band(f,[0.30,0.70,0.40,0.48]))}`);
        if(vname==='line'){ const r=rows(f,0.30,0.70,0.40,0.56);
          let step=0, at=-1; for(let i=1;i<r.length;i++){ const d=Math.abs(r[i]-r[i-1]); if(d>step){ step=+d.toFixed(1); at=i; } }
          console.log(`    line  rows ${r.join(' ')}`);
          console.log(`    line  biggest row-to-row step ${step} at row ${at}`); }
      }
    }
    console.log('  frames: bench/results/sealook-{old,new}-{down,along,line}.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
