// Ben 08-04: "daytime white fog to night time dark black fog should be a smooth transition through dusk."
// SO MEASURE THE RAMP, at a fine step, and print SECOND DIFFERENCES. A curve that merely falls is not the complaint; a curve
// with a kink or a cliff in it is. Reported in two spaces because they fail differently:
//   lum   - the fog colour's own luminance, linear. A kink here is arithmetic (a clamp, a gate, a floor being crossed).
//   scr   - what the frame actually shows. A kink here with a smooth lum is the tonemap, and no amount of colour tuning fixes it.
// Also prints `day`, because uDay is a smoothstep on sun ELEVATION and most of dusk happens inside a tenth of the clock.
//   node bench/tmp-fogramp.mjs [wf]
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
const WF=+(process.argv[2]||0.9);
const LAND=[0.20,0.80,0.62,0.85];
function mean(img,box){ const {w,h,ch,data}=img; let s=0,n=0;
  for(let y=Math.round(h*box[2]); y<Math.round(h*box[3]); y++)
    for(let x=Math.round(w*box[0]); x<Math.round(w*box[1]); x++){ const k=(y*w+x)*ch; s+=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; n++; }
  return +(s/n).toFixed(1); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:800,height:500}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const g=await page.evaluate('__hc.probe()');
    const rows=[];
    console.log('  wf='+WF+'   frac    day       fog lum    screen');
    for(let t=0.46; t<=0.72001; t+=0.01){
      await page.evaluate(`__hc.setTime(${t.toFixed(3)})`); await page.evaluate(`__hc.fog(${WF})`);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
      await page.evaluate('__hc.cam({yaw:1.6,pitch:0.05})'); await sleep(900);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(450);
      const st=await page.evaluate('__hc.fogState()');
      const f=path.join(ROOT,'bench','results','fogramp-'+t.toFixed(2).replace('.','p')+'.png');
      await page.screenshot({path:f});
      const scr=mean(decodePNG(fs.readFileSync(f)), LAND);
      rows.push({t:+t.toFixed(3), day:st.day, lum:st.lum, scr});
      console.log('        '+t.toFixed(2)+'   '+String(st.day).padStart(7)+'   '+String(st.lum).padStart(8)+'   '+String(scr).padStart(6));
    }
    // Second differences: on a smooth ramp these stay small and change sign gently. One value far larger than its neighbours is
    // the kink, and its position says which term caused it.
    const d2=(k)=>rows.map((r,i)=> (i===0||i===rows.length-1) ? null
      : +(rows[i+1][k] - 2*rows[i][k] + rows[i-1][k]).toFixed(4));
    const l2=d2('lum'), s2=d2('scr');
    const worstL=l2.reduce((a,v,i)=> (v!=null && Math.abs(v)>Math.abs(l2[a]||0))?i:a, 1);
    const worstS=s2.reduce((a,v,i)=> (v!=null && Math.abs(v)>Math.abs(s2[a]||0))?i:a, 1);
    console.log('\n  fog-lum 2nd diffs: '+l2.map(v=>v==null?'-':v).join(' '));
    console.log('  worst at frac '+rows[worstL].t+'  ('+l2[worstL]+')');
    console.log('  screen  2nd diffs: '+s2.map(v=>v==null?'-':v).join(' '));
    console.log('  worst at frac '+rows[worstS].t+'  ('+s2[worstS]+')');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
