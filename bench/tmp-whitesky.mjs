// P1: "the sky is back to being white". Ben, 2026-08-17 ~05:20.
//
// NaN FIRST. `_uniGuard` and `__hc.nanWatch()` exist because a single non-finite shared uniform once whited out
// the entire world, and a total whiteout is what that failure looks like from the outside — so the cheapest and
// most likely answer gets asked before any shader is read. If the guard has fired, the name it logged IS the
// answer, and the question becomes what made that uniform non-finite tonight rather than what the sky shader does.
//
// THEN THE FOUR NUMBERS. /diag prints them, and they separate the kinds of whiteout from each other: a saturated
// sky term, a lifted exposure clamp, a lost context and a software renderer all look identical in a screenshot
// and different in those numbers. The renderer string and the context-lost count are also what answer "is it his
// machine" — which has to be answered either way, because he was told it was his PC once already tonight.
//
// AND THE SKY IS MEASURED AT THREE HOURS, not one. c9eab7e made noon, a low sun and midnight three separate
// grades, so a regression can live in one of them and leave the other two correct; a single noon frame would
// then clear a build that is broken at the hour he was looking at.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const PAGE=process.env.HC_PAGE||'index.html';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// The SKY band only — the top fifth of the frame, above the horizon at a level camera. Reported as mean rgb and
// as how much of it is near-white, because "white sky" is a saturation claim and a mean alone hides it.
const SKY=(page,f)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data;
  let r=0,gg=0,b=0,n=0,white=0,blue=0;
  for(let y=0;y<H*0.20;y++)for(let x=0;x<W;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++;
    if(d[i]>236&&d[i+1]>236&&d[i+2]>236) white++;
    if(d[i+2]>d[i]+8) blue++; }
  return { rgb:[+(r/n).toFixed(0),+(gg/n).toFixed(0),+(b/n).toFixed(0)],
           nearWhitePct:+(100*white/n).toFixed(1), blueDominantPct:+(100*blue/n).toFixed(1) };
}, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    page.on('console',m=>{ const t=m.text(); if(/non-finite|NaN|context lost|shader/i.test(t)) console.log('  CONSOLE:',t.slice(0,200)); });
    console.log('  page:', PAGE);
    await page.goto(base+'/'+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(8000);
    // Meshed before measured — an unmeshed world photographs as a flat field and would be read as a whiteout.
    for(let i=0;i<60;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }

    console.log('\n  === THE MOST LIKELY CAUSE, ASKED FIRST: a non-finite shared uniform ===');
    console.log('   nanWatch:', JSON.stringify(await page.evaluate('(()=>{try{return __hc.nanWatch();}catch(e){return String(e.message||e);}})()')).slice(0,400));
    console.log('\n  === /diag ===');
    console.log('   ', JSON.stringify(await page.evaluate('(()=>{try{return __hc.diag?__hc.diag():__hc.cmdRun("/diag");}catch(e){return String(e.message||e);}})()')).slice(0,700));
    console.log('\n  === which surfaces are on the shared lighting model ===');
    console.log('   ', JSON.stringify(await page.evaluate('(()=>{try{return __hc.lightPaths();}catch(e){return String(e.message||e);}})()')).slice(0,500));

    console.log('\n  === THE SKY ITSELF, at three hours (c9eab7e made them three grades) ===');
    await page.evaluate('__hc.cam({yaw:0.6,pitch:0.16})');
    for(const [tag,f] of [['noon',0.25],['low sun',0.44],['midnight',0.75]]){
      await page.evaluate('__hc.dayLock('+f+')'); await sleep(2500);
      const file=path.join(OUT,'whitesky-'+tag.replace(' ','')+'.png'); await page.screenshot({path:file});
      console.log('   ', tag.padEnd(9), JSON.stringify(await SKY(page,file)),
        '  tod', JSON.stringify(await page.evaluate('(()=>{const t=__hc.tod();return {elev:+t.elev.toFixed(2),resolved:t.resolved};})()')).slice(0,190));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
