// FIND THE FRAME FIRST. Ben's report is about "the darkest parts of the night sky", and I have already wasted two runs
// photographing the wrong place — a bright moonlit sky at the wrong hour shows nothing. So sweep the night hours and a spread
// of look directions, and let the CPU rank the frames by how much they LOOK LIKE the fault instead of me squinting at them.
//
// THE DETECTOR. A dark line crossing a smooth gradient is a row (or column) that is darker than both its neighbours. Grain is
// per-pixel and uncorrelated, so averaging a band of 150 px kills it while a LINE survives — that is the whole reason the
// measurement is a band average and not a pixel. Dark birds are a few pixels wide and die in the same average.
// Reports, per frame: the deepest dip found, how many dips, and the darkest band luminance (so "is this even a dark sky?" is
// answered by a number and not by a hopeful camera angle).
//   node bench/tmp-nightsky-hunt.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// One scan line = the average of a band, walked across the frame. Returns the deepest dip and how many there are.
// CROPPED TO THE SKY. Uncropped it ranked every frame identically at 55 levels on row 39 — that is the objective TEXT in the
// corner, not the sky, and the HUD is in every frame so it drowned the actual signal.
function scan(img, along, bandFrac, box){
  const {w,h,ch,data}=img;
  const res={deepest:0, dips:0, minL:255, at:null};
  const X0=Math.round(w*box[0]), X1=Math.round(w*box[1]), Y0=Math.round(h*box[2]), Y1=Math.round(h*box[3]);
  const lines = along==='y' ? h : w;
  const bandW = Math.round((along==='y'?w:h)*bandFrac);
  const bMin = along==='y'? X0 : Y0, bMax = along==='y'? X1 : Y1;
  for(let b=bMin; b+bandW<=bMax; b+=bandW){
    const L=[];
    const i0 = along==='y'? Y0 : X0, i1 = along==='y'? Y1 : X1;
    for(let i=i0;i<i1;i++){
      let s=0,n=0;
      for(let j=b;j<b+bandW;j++){
        const x = along==='y'? j : i, y = along==='y'? i : j;
        if(y>=h||x>=w) continue;
        const k=(y*w+x)*ch; s+=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; n++;
      }
      L.push(n?s/n:0);
    }
    for(let i=2;i<L.length-2;i++){
      // Compare against the mean of the two rows either side, so a genuine slope in the gradient is not read as a dip.
      const around=(L[i-2]+L[i-1]+L[i+1]+L[i+2])/4, d=around-L[i];
      if(L[i]<res.minL && L[i]>2) res.minL=L[i];
      if(d>=1.2){ res.dips++; if(d>res.deepest){ res.deepest=d; res.at=[along,b,i]; } }
    }
  }
  return res;
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  const rows=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2000);
    // ABOVE THE CANOPY. The first sweep ran from spawn, which is inside the wood: every frame was black branches, no sky in it
    // at all. 45 blocks up clears the trees and leaves nothing but sky in the crop.
    { const p=await page.evaluate('__hc.pos()'); await page.evaluate(`__hc.tpAt(${p.x},${p.y+45},${p.z})`); }
    await sleep(2500);
    const BOX=[0.15,0.85,0.03,0.52];   // sky only: clear of the HUD corners, the hotbar and the compass
    // Gravity puts us back in the trees between shots, so the altitude is re-established before every frame.
    const keepUp=async()=>{ const g=await page.evaluate('__hc.probe()'); await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(500); };
    // MEASURED NIGHT (bench/tmp-daymap.mjs), not the hook's comment: __hc.setTime says "0 = midnight" and it is WRONG — uDay
    // is 1 at t=0. uDay actually reaches 0 across t 0.63..0.94, and the sky is darkest at 0.63 (luma 41) and 0.94 (51).
    // Every earlier sweep here was photographing daylight.
    for(const t of [0.63,0.70,0.75,0.81,0.88,0.94]){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(1400);
      for(const yaw of [0.0,1.6,3.1,4.7]){
        for(const pitch of [1.25,0.8]){
          await keepUp();
          await page.evaluate(`__hc.cam({yaw:${yaw},pitch:${pitch}})`); await sleep(700);
          const tag='t'+String(t).replace('.','p')+'-y'+String(yaw).replace('.','p')+'-p'+String(pitch).replace('.','p');
          const file=path.join(ROOT,'bench','results','hunt-'+tag+'.png');
          await page.screenshot({path:file});
          const img=decodePNG(fs.readFileSync(file));
          const a=scan(img,'y',0.12,BOX), b=scan(img,'x',0.12,BOX);
          const worst = a.deepest>=b.deepest?a:b;
          rows.push({ tag, deepest:+worst.deepest.toFixed(2), dips:a.dips+b.dips, minL:Math.round(Math.min(a.minL,b.minL)), at:worst.at, file });
        }
      }
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  rows.sort((p,q)=>q.deepest-p.deepest);
  console.log('  frame'.padEnd(28)+'deepest dip  dips  darkest band');
  for(const r of rows.slice(0,12)) console.log('  '+r.tag.padEnd(26)+String(r.deepest).padStart(8)+String(r.dips).padStart(7)+String(r.minL).padStart(9)+'   '+JSON.stringify(r.at));
  console.log('\n  worst frame: '+(rows[0]&&rows[0].file));
})().catch(e=>{ console.error(e); process.exit(1); });
