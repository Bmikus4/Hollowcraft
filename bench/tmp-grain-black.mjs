// BLACK TEXELS AT NIGHT, WITH THE GRAIN ON — the condition every harness in this repo has been blind to.
// Ben, 08-05: "black texels everywhere". assert-night-crush measured 0% crushed black and it disables film grain in an
// addInitScript, exactly as §7 tells it to, because grain is noise inside a noise measurement. But grain SHIPS ON at 0.06, it is
// SIGNED, and the grade adds it before the output dither — so the artefact a player sees may be the grain punching dark pixels to
// zero, which no measurement here could ever have seen.
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
// Pure black, and ISOLATED pure black: a cave mouth is legitimately black, but a zero pixel with a lit neighbour one texel away is
// something the grade did.
function crush(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  let n=0,black=0,iso=0,sum=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const l=L(x,y); n++; sum+=l;
    if(l<=1){ black++; let hi=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; const q=L(xx,yy); if(q>hi)hi=q; }
      if(hi>14) iso++; } }
  return { blackPct:+(100*black/n).toFixed(3), isoPct:+(100*iso/n).toFixed(3), mean:+(sum/n).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const grain of ['0.06','0']){
      const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
      await ctx.addInitScript(`try{ localStorage.setItem('hollowcraft_grain','${grain}'); }catch(e){}`);
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
      await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
      const S=await page.evaluate(`__hc.st()`);
      const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
      await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+2.6, ${S.sz}+9.5)`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(1600);
      await page.evaluate(`__hc.setBlock(${S.sx}, ${gy}+1, ${S.sz}, 'lantern')`); await sleep(900);
      await page.evaluate(`__hc.cam({yaw:${Math.PI}, pitch:-0.42})`);
      await page.evaluate(`__hc.setTime(0.94)`); await sleep(600); await page.evaluate(`__hc.setTime(0.94)`); await sleep(300);
      const f=path.join(OUT,`grain-${grain.replace('.','p')}.png`); await page.screenshot({path:f});
      // three crops: ground beside the lamp, the dark ground beyond its pool, and the treeline where trunks fill the frame
      for(const [name,c] of [['lit ground',[0.12,0.44,0.50,0.78]],['beyond the pool',[0.60,0.92,0.52,0.76]],['trunks',[0.30,0.70,0.20,0.42]]])
        console.log(`  grain ${grain}  ${name.padEnd(16)} ${JSON.stringify(crush(f,c))}`);
      await page.close(); await ctx.close();
    }
    console.log('  frames: bench/results/grain-0p06.png, grain-0.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
