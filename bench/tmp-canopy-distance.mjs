// WHY THE DISTANT CANOPY READS GREY. Ben has called this "trees and foliage turning white"; at 200 blocks in daylight
// the same stand that is rich green up close comes out a chalky grey (bench/results/skyrefl-refl-on.png).
//
// The question is which term drains it, so this measures the SAME STAND from two distances and then re-shoots the far
// one with the fog dial pulled down. Saturation is the metric, not luminance: fog does not just brighten a surface, it
// replaces its colour with the air's, and a treeline that has lost its green while keeping its shape is a colour fault.
// Green dominance is reported beside it because a grey that is still slightly green is a different fault from a neutral
// one. The near row is repeated last as the noise floor.
//
//   node bench/tmp-canopy-distance.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    // The stand: a wooded shoulder well inside the island. The camera stands due -x of it at two ranges and looks at it,
    // at the same eye height above the STAND's ground both times, so the canopy sits in the same part of the frame.
    const tx=IC.x-Math.round(IC.R*0.35), tz=IC.z+Math.round(IC.R*0.20);
    const tg=await page.evaluate(`__hc.groundY(${tx},${tz})`);
    const shoot=async(tag,dist,fogmul)=>{
      const x=tx-dist;
      await page.evaluate(`__hc.vis({fogmul:${fogmul}}); __hc.tpAt(${x}+0.5, ${tg}+26, ${tz}+0.5); __hc.cam({yaw:${Math.atan2(-1,-0)+Math.PI}, pitch:-0.05}); __hc.fog(0); __hc.freezeT(0); __hc.setTime(0.25)`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500); await page.evaluate(`__hc.setTime(0.25)`); await sleep(500);
      const f=path.join(OUT,`cdist-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const d=g.getImageData(440,250,400,240).data; let sat=0,grn=0,lum=0,n=0;
        for(let i=0;i<d.length;i+=4){ const r=d[i],gg=d[i+1],b=d[i+2];
          const mx=Math.max(r,gg,b), mn=Math.min(r,gg,b);
          sat += mx>0?(mx-mn)/mx:0; grn += gg-(r+b)/2; lum += 0.2126*r+0.7152*gg+0.0722*b; n++; }
        return { sat:+(sat/n).toFixed(3), green:+(grn/n).toFixed(1), lum:+(lum/n).toFixed(1) }; })()`);
      const fi=await page.evaluate(`__hc.fogInfo()`);
      console.log(`    ${tag}  dist ${dist}  fogmul ${fogmul}   sat ${s.sat}  green ${s.green}  lum ${s.lum}   fogReach ${fi.reach.toFixed(0)} fogLum ${fi.colorLum.toFixed(3)}`);
      return s;
    };
    await shoot('near-60', 60, 1.0);
    await shoot('far-220', 220, 1.0);
    await shoot('far-220-fog015', 220, 0.15);
    await shoot('far-220-fog0', 220, 0.0);
    await page.evaluate('__hc.pines(0)'); await sleep(900); await shoot('near-60-nopines', 60, 1.0);
    await page.evaluate('__hc.pines(1)'); await sleep(900);
    await shoot('near-60-repeat', 60, 1.0);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
