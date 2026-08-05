// Ben 08-04: "volumetric fog isnt bright enough." MEASURE IT FIRST, because this fog's colour has been tuned four separate
// times to make NIGHT fog read as blackness, and a brightness change made by eye could undo all of it.
//
// THE SUSPICION, from reading updateSky: clear-air day fog is dcol = 0.0018 + 0.764*day, so ~0.766 at noon. A weather fog BANK
// then lerps that colour up to 88% of the way toward 0.54/0.56/0.60 — which is DARKER. So rolling a fog bank in at midday makes
// the air dimmer than clear air, when a real fog bank in daylight is the brightest thing in the frame: it is sunlight scattered
// off water droplets. Same at dusk. Photograph clear vs bank at several hours and compare the numbers.
//   node bench/tmp-fogbright.mjs
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
// The horizon band, not the whole frame: that is where fog IS. Includes ground and sky either side of it deliberately, since the
// complaint is about how the fog reads against them.
// TWO boxes. The first mixed sky and land, and no fog can out-brighten a noon sky without crossing the bloom threshold, so that
// number was always going to look like a failure. What matters is the LAND the fog hides: a daylight bank should read far
// brighter than the landscape behind it. Sky is measured too, to be sure the bank is not DARKER than the sky it replaces.
const BOX=[0.20,0.80,0.35,0.62];
const SKY=[0.20,0.80,0.10,0.30], LAND=[0.20,0.80,0.62,0.85];
function stats(img,box){ const {w,h,ch,data}=img; let s=0,n=0,mx=0;
  for(let y=Math.round(h*box[2]); y<Math.round(h*box[3]); y++)
    for(let x=Math.round(w*box[0]); x<Math.round(w*box[1]); x++){ const k=(y*w+x)*ch;
      const L=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; s+=L; n++; if(L>mx)mx=L; }
  return { mean:+(s/n).toFixed(1), max:Math.round(mx) }; }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1000,height:600}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const g=await page.evaluate('__hc.probe()');
    console.log('  hour  fog   sky-band mean   max   fogColor            density');
    for(const t of [0.25,0.5,0.56,0.63,0.75]){          // noon, afternoon, dusk, first dark, deep night (see tmp-daymap)
      for(const wf of [0,0.9]){
        await page.evaluate(`__hc.setTime(${t})`);
        await page.evaluate(`__hc.fog(${wf})`);
        await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
        await page.evaluate('__hc.cam({yaw:1.6,pitch:0.05})'); await sleep(1600);
        await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(700);
        const f=path.join(ROOT,'bench','results','fogb-t'+String(t).replace('.','p')+'-w'+String(wf).replace('.','p')+'.png');
        await page.screenshot({path:f});
        const img=decodePNG(fs.readFileSync(f));
        const s=stats(img, BOX), sk=stats(img, SKY), ld=stats(img, LAND);
        console.log('        sky '+String(sk.mean).padStart(6)+'   land '+String(ld.mean).padStart(6));
        const sky=await page.evaluate('(()=>{ const c=scene&&scene.fog?scene.fog.color:null; return c?{r:+c.r.toFixed(4),g:+c.g.toFixed(4),b:+c.b.toFixed(4),d:+scene.fog.density.toFixed(5)}:null; })()').catch(()=>null);
        console.log('  '+t.toFixed(2)+'  '+String(wf).padStart(4)+'   '+String(s.mean).padStart(10)+'  '+String(s.max).padStart(5)
          +'   '+(sky?`(${sky.r}, ${sky.g}, ${sky.b})`.padEnd(30):'?'.padEnd(30))+(sky?sky.d:''));
      }
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
