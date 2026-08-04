// TUNE THE SCOTOPIC WASHOUT'S TWO THRESHOLDS, IN ONE PAGE.
// Set them live through __hc.scot and measure: night dirt and grass must lose their chroma without losing luminance, and
// DAYLIGHT must not move at all. What this run settled, on the FACE-LIGHT gate that shipped (lo/hi on max(blockLight,
// bakedSky*day)): 0.02/0.20 takes night dirt from sat 0.934 to 0.234 and leaves daylit dirt at 0.704 -> 0.704; 0.02/0.35
// reaches 0.155 but the colour is then not fully back until a face is at 0.35 light, which greys a torch-lit cellar;
// 0.10/0.75 is 0.095 and greys more still. Rejected outright: gating on the PIXEL's luminance (0.002/0.02 -> night dirt
// 0.35 but the beach sand stayed salmon, because sand is a brighter texture under the same moonlight, and 0.004/0.04 cost
// daylit dirt 14% of its saturation, since a shaded block in daylight is a dark pixel).
//   node bench/tmp-scot-tune.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
function classify(file){
  const P=decodePNG(fs.readFileSync(file)); const dirt=[], grass=[];
  const x0=(P.w*0.10)|0,x1=(P.w*0.80)|0,y0=(P.h*0.45)|0,y1=(P.h*0.85)|0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    if(r>60&&r<150&&g<r*0.75&&g>b*1.15) dirt.push([x,y]);
    else if(g>60&&g>r*1.25&&g>b*1.4) grass.push([x,y]); }
  return {dirt,grass};
}
function readSet(file, pts){
  const P=decodePNG(fs.readFileSync(file)); let R=0,G=0,B=0,S=0,n=0;
  for(const [x,y] of pts){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); R+=r;G+=g;B+=b; S+= mx>0?(mx-mn)/mx:0; n++; }
  return { rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)], sat:+(S/n).toFixed(3), lum:+(0.2126*R/n+0.7152*G/n+0.0722*B/n).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+2.6}, ${S.sz}+10.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    await page.evaluate(`__hc.setBlock(${S.sx},${gy+1},${S.sz},'lantern')`); await sleep(1000);
    await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.30})`);
    const shot=async(t,name)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(600); await page.evaluate(`__hc.setTime(${t})`); await sleep(220);
      const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    // Classify off ?albedo taken at THIS vantage by tmp-hash-repro.mjs; if it is missing, classify off the day frame instead.
    const dayOff=await (async()=>{ await page.evaluate(`__hc.scot({amt:0})`); return shot(0.42,'scot-day-off.png'); })();
    const C=classify(fs.existsSync(path.join(OUT,'hash-albedo.png'))?path.join(OUT,'hash-albedo.png'):dayOff);
    console.log(`  ${C.dirt.length} dirt px, ${C.grass.length} grass px`);
    const line=(tag,f)=>{ const d=readSet(f,C.dirt), g=readSet(f,C.grass);
      console.log(`   ${tag.padEnd(26)} dirt ${JSON.stringify(d.rgb).padEnd(22)} sat ${String(d.sat).padEnd(6)} lum ${String(d.lum).padEnd(6)} | grass ${JSON.stringify(g.rgb).padEnd(22)} sat ${String(g.sat).padEnd(6)} lum ${g.lum}`); };
    line('DAY   amt 0 (control)', dayOff);
    for(const [lo,hi] of [[0.02,0.35],[0.05,0.55],[0.02,0.20],[0.10,0.75]]){
      await page.evaluate(`__hc.scot({amt:1,lo:${lo},hi:${hi}})`);
      line(`DAY   lo ${lo} hi ${hi}`, await shot(0.42,`scot-day-${lo}-${hi}.png`));
    }
    await page.evaluate(`__hc.scot({amt:0})`);
    line('NIGHT amt 0 (control)', await shot(0.94,'scot-night-off.png'));
    for(const [lo,hi] of [[0.02,0.35],[0.05,0.55],[0.02,0.20],[0.10,0.75]]){
      await page.evaluate(`__hc.scot({amt:1,lo:${lo},hi:${hi}})`);
      line(`NIGHT lo ${lo} hi ${hi}`, await shot(0.94,`scot-night-${lo}-${hi}.png`));
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
