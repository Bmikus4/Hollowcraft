// THE INLAND MOUNTAINS, FROM THE ONE VANTAGE THEY EXIST FOR: standing near the coast, looking IN across the island.
// A/B by the live toggle (__hc.mtn), so the two frames differ by nothing else, and the strip measured is the band of
// horizon above the island's own treeline.
//
//   node bench/tmp-mtn-look.mjs [page]
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
    const logs=[]; page.on('console',m=>{ const t=m.text(); if(/error|ERROR|invalid|Shader/.test(t)) logs.push(t.slice(0,300)); });
    page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,300)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    // Near the coast on the -x side, looking IN: forward is (-sin yaw, -cos yaw), so facing +x is yaw = atan2(-1, 0).
    const x=IC.x-Math.round(IC.R*0.92), z=IC.z;
    const g=await page.evaluate(`__hc.groundY(${x},${z})`);
    await page.evaluate(`__hc.tpAt(${x}+0.5, ${Math.max(g,42)+38}, ${z}+0.5); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:0.02}); __hc.dayLock(0.28); __hc.fog(0)`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(3000);
    const grab=async(tag)=>{ const f=path.join(OUT,'mtn-'+tag+'.png'); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g2=c.getContext('2d'); g2.drawImage(im,0,0);
        const d=g2.getImageData(0,230,1280,180).data; const px=[];
        for(let i=0;i<d.length;i+=4) px.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]);
        return px; })()`); };
    console.log('  mtn', JSON.stringify(await page.evaluate(`__hc.mtn()`)));
    const on=await grab('on');
    await page.evaluate(`__hc.mtn(0)`); await sleep(900);
    const off=await grab('off');
    await page.evaluate(`__hc.mtn(1)`); await sleep(900);
    const on2=await grab('on2');
    let d1=0,d2=0,ch=0; const n=on.length;
    for(let i=0;i<n;i++){ const a=Math.abs(on[i]-off[i]); d1+=a; if(a>4) ch++; d2+=Math.abs(on[i]-on2[i]); }
    console.log(`  ridge strip: mean |on-off| ${(d1/n).toFixed(2)}   noise |on-on| ${(d2/n).toFixed(2)}   pixels changed >4 levels: ${(100*ch/n).toFixed(1)}%`);
    for(const [when,t] of [['noon',0.28],['dusk',0.46],['night',0.75]]){
      await page.evaluate(`__hc.dayLock(${t})`); await sleep(1200);
      await page.screenshot({path:path.join(OUT,'mtn-'+when+'.png')}); }
    console.log('  logs: '+(logs.length?logs.join(' | ').slice(0,400):'(none)'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
