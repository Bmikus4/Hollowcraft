// DOES THE SKYLIGHT FLOOD REACH INTO A SHELTER, and how far.
//
// Builds the same box assert-directional-sky builds — 9x9 floor and roof, three walls, the fourth side wide open — and
// walks the flood level in from the opening. This answers the question the frame cannot: a soffit that still reads 2 of
// 255 is either a flood that never arrived or a flood that arrived and is not being used, and only the level says which.
//
//   node bench/tmp-skyflood.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const FY=96, RY=101;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const BX=Math.round(S.sx)+6, BZ=Math.round(S.sz);
    await page.evaluate(`(()=>{
      for(let dx=0;dx<9;dx++) for(let dz=-4;dz<=4;dz++){
        __hc.cmdRun('/setblock '+(${BX}+dx)+' ${FY} '+(${BZ}+dz)+' stone');
        __hc.cmdRun('/setblock '+(${BX}+dx)+' ${RY} '+(${BZ}+dz)+' stone'); }
      for(let dz=-4;dz<=4;dz++) for(let y=${FY}+1;y<${RY};y++) __hc.cmdRun('/setblock '+(${BX}+8)+' '+y+' '+(${BZ}+dz)+' stone');
      for(let dx=0;dx<9;dx++) for(let y=${FY}+1;y<${RY};y++){ __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}-4)+' stone');
        __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}+4)+' stone'); }
    })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    console.log(`  box floor y=${FY} roof y=${RY}, open side at x=${BX}-1, walls at x=${BX}+8 and z=${BZ}+-4`);
    for(const dx of [-2,-1,0,1,2,3,4,5,6,7]){
      const r=await page.evaluate(`__hc.skyAt(${BX}+${dx}, ${FY}+3, ${BZ})`);
      console.log(`    x offset ${String(dx).padStart(3)}  ${JSON.stringify(r)}`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
