// A FOG BANK IS BRIGHT BY DAY AND BLIND AT NIGHT, and those are two opposite requirements from the same person.
//
// Ben 08-04: "volumetric fog isnt bright enough" — about DAYLIGHT fog, which was darker than clear air: the bank's day colour
// was 0.54/0.56/0.60 against a clear-air day fog of 0.766, so rolling fog in at midday DIMMED the world. Fog is sunlight
// scattered off droplets; a daylight bank is brighter than the landscape it hides, which is why you cannot see into it.
//
// AND FOUR SEPARATE TIMES BEFORE THAT, Ben ruled that NIGHT fog must read as blackness — "a fog bank at night is not grey air,
// it is not being able to see". Both ends live in one lerp on `day`, so brightening the day end by eye is exactly how the night
// end gets dragged up with it. THAT is why this file exists: it holds both ends at once, and either one alone is a regression.
//
// MEASURED OVER THE LAND, not the whole frame. A box straddling the horizon contains the sun and the bright sky, and no fog can
// out-brighten a noon sky without crossing the bloom threshold — that number said "darker" while both the sky and the land above
// and below it had brightened. The land is what the fog hides, so the land is what the comparison is about.
//
//   node bench/assert-fog-bank.mjs
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
const LAND=[0.20,0.80,0.62,0.85], SKYB=[0.20,0.80,0.10,0.30];
// HOURS ARE MEASURED, NOT ASSUMED (bench/tmp-daymap.mjs): __hc.setTime's "0 = midnight" comment is wrong — uDay is 1 at t=0.
// Daylight is t 0.12..0.50, dusk 0.56, and uDay reaches 0 across 0.63..0.94.
const DAY=[0.25,0.50], DUSK=[0.56], NIGHT=[0.63,0.75];
function mean(img,box){ const {w,h,ch,data}=img; let s=0,n=0;
  for(let y=Math.round(h*box[2]); y<Math.round(h*box[3]); y++)
    for(let x=Math.round(w*box[0]); x<Math.round(w*box[1]); x++){ const k=(y*w+x)*ch; s+=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; n++; }
  return +(s/n).toFixed(1); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1000,height:600}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const g=await page.evaluate('__hc.probe()');
    // Above the trees: from inside the wood the "land" box is branches a metre away, which no fog at this density touches.
    const shot=async(t,wf,tag)=>{
      await page.evaluate(`__hc.setTime(${t})`); await page.evaluate(`__hc.fog(${wf})`);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
      await page.evaluate('__hc.cam({yaw:1.6,pitch:0.05})'); await sleep(1600);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(700);
      const f=path.join(ROOT,'bench','results','fogbank-'+tag+'.png');
      await page.screenshot({path:f});
      const img=decodePNG(fs.readFileSync(f));
      return { land:mean(img,LAND), sky:mean(img,SKYB) };
    };
    const rows=[];
    for(const t of [...DAY,...DUSK,...NIGHT]){
      const clear=await shot(t,0,'t'+String(t).replace('.','p')+'-clear');
      const bank =await shot(t,0.9,'t'+String(t).replace('.','p')+'-bank');
      const night=NIGHT.includes(t);
      rows.push({t,night,clear,bank});
      console.log('     t '+t.toFixed(2)+(night?'  night':'  day  ')+'   land '+String(clear.land).padStart(6)+' -> '+String(bank.land).padStart(6)
        +'    sky '+String(clear.sky).padStart(6)+' -> '+String(bank.sky).padStart(6));
    }
    const dayRows=rows.filter(r=>!r.night), nightRows=rows.filter(r=>r.night);
    // 1.25x, not merely ">": fog that is a hair brighter than the land is not fog, it is haze, and the complaint was that it did
    // not read as fog. At the hours sampled the fix gives 1.27x and 3.7x.
    const dim=dayRows.filter(r=>r.bank.land < r.clear.land*1.25);
    check('a daylight fog bank is markedly BRIGHTER than the land it hides', dim.length===0,
      dim.map(r=>`t${r.t} ${r.clear.land}->${r.bank.land}`).join('; ')||dayRows.map(r=>`t${r.t} x${(r.bank.land/r.clear.land).toFixed(2)}`).join('  '));
    check('and it is not darker than the sky it replaces either', dayRows.every(r=>r.bank.sky>=r.clear.sky*0.95),
      dayRows.map(r=>`t${r.t} ${r.clear.sky}->${r.bank.sky}`).join('  '));
    // THE OTHER END, AND IT IS THE OLDER RULING. Four rounds of Ben's notes say night fog is blackness.
    const lit=nightRows.filter(r=>r.bank.land > r.clear.land*0.85);
    check('a NIGHT fog bank still takes the world to blackness', lit.length===0,
      lit.map(r=>`t${r.t} ${r.clear.land}->${r.bank.land}`).join('; ')||nightRows.map(r=>`t${r.t} x${(r.bank.land/r.clear.land).toFixed(2)}`).join('  '));
    check('and night fog stays genuinely dark in absolute terms', nightRows.every(r=>r.bank.land<25),
      nightRows.map(r=>`t${r.t} ${r.bank.land}`).join('  '));
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('Both ends are one lerp on `day` in updateSky. Brightening the day end by eye is how the night end gets\n'
      +'dragged up with it, which is the regression this file exists to catch.');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
