// WHY THE BAND DRAWS NOTHING. The on/off diff in tmp-pines-shore4 is animation-dominated (the water and the clouds
// move between the two shots), so it cannot answer "is anything drawn". uDbgAll can: mode 1 paints the whole quad
// magenta before any gate, mode 2 paints only where a fragment has survived every gate. Counting magenta pixels in
// each mode separates "the quad is not on screen" from "the quad is on screen and every fragment is discarded".
//
//   node bench/tmp-pines-why.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Magenta fraction of the frame, read on the page's own canvas so the count and the shot are the same frame.
async function magenta(page,file){
  const buf=fs.readFileSync(file).toString('base64');
  return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
    await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,im.width,im.height).data;
    let n=0, top=-1, bot=-1;
    for(let y=0;y<im.height;y++){ let row=0;
      for(let x=0;x<im.width;x++){ const i=(y*im.width+x)*4;
        if(d[i]>170 && d[i+1]<90 && d[i+2]>170){ row++; n++; } }
      if(row>0){ if(top<0) top=y; bot=y; } }
    return { frac:+(n/(im.width*im.height)).toFixed(5), top, bot }; })()`);
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
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,300)));
    page.on('console',m=>{ const t=m.text(); if(/shader|program|GL_|compil|VALIDATE/i.test(t)) errs.push('CONSOLE: '+t.slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);

    console.log('pines   ', JSON.stringify(await page.evaluate('__hc.pines()')));
    console.log('probe   ', JSON.stringify(await page.evaluate('__hc.pinesProbe()')));
    console.log('mask    ', JSON.stringify(await page.evaluate('__hc.pinesMask()')));

    // Stand at the shore on the STRONGEST bearing the mask has, facing out along it: if the band draws anywhere it
    // draws here, so a null result here is a null result everywhere.
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const pr=await page.evaluate('__hc.pinesProbe()');
    const az=pr.strongestBearing.azRad;
    const shore=await page.evaluate(`(()=>{ const dx=Math.cos(${az}), dz=Math.sin(${az});
      for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(${IC.x}+dx*d), z=Math.round(${IC.z}+dz*d);
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z),d}; } return null; })()`);
    console.log('shore   ', JSON.stringify(shore), 'strongestAzDeg', (az*180/Math.PI).toFixed(1));
    if(!shore) throw new Error('no shore on the strongest bearing');
    await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${shore.g}+1, ${shore.z}+0.5); __hc.cam({yaw:${pr.strongestBearing.lookYaw}, pitch:0});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    console.log('draw    ', JSON.stringify(await page.evaluate('__hc.pineDraw()')));
    console.log('horizon ', JSON.stringify(await page.evaluate('__hc.pineHorizon(96)')));
    console.log('cellHere', JSON.stringify(await page.evaluate(`__hc.pineCell(${pr.strongestBearing.cell})`)));

    // The env array the shader actually reads, so "the mask is empty" is a fact and not an inference.
    const env=await page.evaluate('(()=>{ const a=[]; for(let i=0;i<384;i++) a.push(__hc.pineCell(i).env); return a; })()');
    const nz=env.filter(v=>v>0.04).length, mx=Math.max(...env);
    console.log(`env     max ${mx.toFixed(3)}  cells>0.04 ${nz}/384  mean ${(env.reduce((a,b)=>a+b,0)/384).toFixed(3)}`);

    for(const mode of [1,2,0]){
      await page.evaluate(`__hc.pinesAll(${mode})`); await sleep(600);
      const f=path.join(OUT,`why-mode${mode}.png`); await page.screenshot({path:f});
      const m=await magenta(page,f);
      console.log(`mode ${mode}: magenta ${(m.frac*100).toFixed(3)}%  rows ${m.top}..${m.bot}  -> ${path.basename(f)}`);
    }
    await page.evaluate('__hc.pinesAll(0)');
    if(errs.length){ console.log('ERRORS:'); errs.slice(0,8).forEach(e=>console.log('  '+e)); }
    else console.log('no page errors');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
