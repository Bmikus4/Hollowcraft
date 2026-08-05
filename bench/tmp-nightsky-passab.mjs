// WHICH PASS DRAWS THE BLACK OUTLINE? The magnified crop (bench/results/crop-line.png) shows a band clamped to PURE BLACK
// hugging a crisp edge in the night sky. Pure black means something SUBTRACTED and clamped, and a band that follows an edge is
// what an occlusion pass does at a depth discontinuity — so the suspects are switchable from the URL, one flag each:
//   ?nossao   - the SSAO pass (darkens depth discontinuities; the sky dome has no depth, but anything IN it does)
//   ?norays   - the god-ray pass
//   ?nomblur  - the motion-blur path, whose scene target is RGBA8 rather than the composer's half-float
// Same seed, same position, same hour, same camera in every variant, so the only difference is the pass.
//   node bench/tmp-nightsky-passab.mjs
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
const VARIANTS=[['base',''],['nossao','&nossao=1'],['norays','&norays=1'],['nomblur','&nomblur=1']];
// How black is the blackest thing in the sky crop, and how many pixels are at or near 0? An outline clamped to black shows up
// as a population of near-zero pixels in a region whose sky is otherwise luma 20-60.
function blackCount(img, box){
  const {w,h,ch,data}=img; let n0=0, n2=0, min=255, tot=0, sum=0;
  for(let y=Math.round(h*box[2]); y<Math.round(h*box[3]); y++)
    for(let x=Math.round(w*box[0]); x<Math.round(w*box[1]); x++){
      const k=(y*w+x)*ch, L=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2];
      tot++; sum+=L; if(L<min)min=L; if(L<=0.6)n0++; if(L<=3)n2++;
    }
  return {min:+min.toFixed(1), atBlack:n0, nearBlack:n2, mean:+(sum/tot).toFixed(1), tot};
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  const BOX=[0.15,0.85,0.03,0.60];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,extra] of VARIANTS){
      const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
      await page.goto(base+'/index.html?debug=1'+extra,{waitUntil:'load',timeout:120000});
      await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
      await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
      await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); __hc.setTime(0.63); })()').catch(()=>{});
      await sleep(2500);
      const g=await page.evaluate('__hc.probe()');
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
      await page.evaluate('__hc.cam({yaw:1.6,pitch:0.8})'); await sleep(1500);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(600);
      const f=path.join(ROOT,'bench','results','pass-'+tag+'.png');
      await page.screenshot({path:f});
      const s=blackCount(decodePNG(fs.readFileSync(f)), BOX);
      console.log('  '+tag.padEnd(10)+'min luma '+String(s.min).padStart(6)+'   pixels at black '+String(s.atBlack).padStart(7)
        +'   near black '+String(s.nearBlack).padStart(7)+'   sky mean '+s.mean);
      await page.close();
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
