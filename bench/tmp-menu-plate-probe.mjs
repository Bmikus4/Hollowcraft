// Why does every lighting harness photograph the menu key art?
// Boots exactly as assert-cave-black does (?debug=1&rd=8, wait started + #load hidden) and then reports
// the display/opacity of every element that could sit over the world canvas.
import { spawn } from 'node:child_process'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){
  const cands=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const c of cands) if(fs.existsSync(c)) return c; return undefined; }
const waitHttp=(url)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(url,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>120){ clearInterval(t); rej(new Error('no server')); } }); },500); });
const PORT=8123;
(async()=>{
  const base='http://127.0.0.1:'+PORT; await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
  await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  // DO NOT GATE ON #load: report whatever state the page reaches, so a plate that never hides is a
// finding rather than a timeout.
  for(let i=0;i<120;i++){ const d=await page.evaluate(`(()=>{try{return document.getElementById('load').style.display;}catch(e){return 'ERR';}})()`); if(d==='none') break; await sleep(1000); }
  const loadDisp=await page.evaluate(`(()=>{const e=document.getElementById('load'); const cs=getComputedStyle(e); return {inline:e.style.display, comp:cs.display, op:cs.opacity, cls:e.className};})()`);
  console.log('  #load:', JSON.stringify(loadDisp));
  const fillRep=await page.evaluate(`(()=>{try{return __hc.fill();}catch(e){return String(e.message);}})()`);
  console.log('  fill:', JSON.stringify(fillRep));
  await sleep(1500);
  const rep=await page.evaluate(`(()=>{
    const out={started:__hc.st().started, over:[]};
    for(const el of document.querySelectorAll('body *')){
      const cs=getComputedStyle(el); const z=+cs.zIndex;
      if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) continue;
      const r=el.getBoundingClientRect(); if(r.width<400||r.height<300) continue;
      if(!(cs.position==='fixed'||cs.position==='absolute')) continue;
      out.over.push({id:el.id||el.tagName, z:isNaN(z)?'auto':z, disp:cs.display, op:cs.opacity,
        bg:(cs.backgroundImage||'none').slice(0,44), src:(el.getAttribute&&el.getAttribute('src'))||'', w:Math.round(r.width), h:Math.round(r.height)});
    }
    out.over.sort((a,b)=>(a.z===b.z?0:(a.z>b.z?-1:1)));
    return out; })()`);
  console.log('  started:', rep.started);
  console.log('  elements covering the world canvas, topmost first:');
  for(const o of rep.over) console.log('   ', JSON.stringify(o));
  await page.screenshot({path:path.join(ROOT,'bench/results/plate-probe-before.png')});
  // THE KEY ART IS A RENDER OF THE CABIN AT SPAWN, so "the frame looks like the key art" does not by itself
  // prove the plate is up. The clock does: with an opaque plate over the canvas, setTime(noon) cannot move a
  // single pixel. Shoot noon with the plate up, then noon with it down, and diff.
  const shoot=async(tag)=>{ const p=path.join(ROOT,'bench/results/plate-probe-'+tag+'.png'); await page.screenshot({path:p}); return p; };
  await page.evaluate(`__hc.setTime(0.25)`); await sleep(600); await page.evaluate(`__hc.setTime(0.25)`); await sleep(900);
  await shoot('noon-plate-up');
  // menuBgStop() is MODULE-SCOPE: page.evaluate naming it throws ReferenceError (§5). Hide the plate through
  // the DOM, which is the only thing a harness can actually reach.
  await page.evaluate(`(()=>{ for(const id of ['bgvid','menufx']){ const e=document.getElementById(id); if(e) e.style.display='none'; } })()`);
  await sleep(1200);
  const after=await page.evaluate(`(()=>{const e=document.getElementById('bgvid'); const f=document.getElementById('menufx');
    return {bgvid:e?getComputedStyle(e).display:'gone', menufx:f?getComputedStyle(f).display:'gone', uDay:__hc.st().uDay};})()`);
  console.log('  after menuBgStop:', JSON.stringify(after));
  await shoot('noon-plate-down');
  console.log('  frames: plate-probe-before / noon-plate-up / noon-plate-down');
  await browser.close();
})();
