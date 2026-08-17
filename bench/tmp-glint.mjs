// THE SUN AND MOON ON THE WATER — the four frames Ben judges this by, from the shore, aimed down the light's own
// azimuth over the sea, at dawn, noon, dusk and a clear night.
// AIMED, not pointed at the sea and hoped: a specular highlight sits where the reflection vector from the EYE meets
// the light, so a frame taken 90 degrees off the sun's bearing proves nothing about whether the track exists. The
// sun's horizontal direction is (cos(ang), 0.35) normalised, which swings from +x at dawn through +z at noon to -x at
// dusk, and the moon is its negation — so the bearing to stand on and the yaw to look down are both computed per hour.
// It also measures the track: the mean and the MAXIMUM luminance in a horizontal strip of sea just below the horizon,
// against the same strip with the camera turned 90 degrees away. A glint is a difference between those two, and a
// number that is the same in both directions is a wash, not a reflection.
//
// TWO OF THE FOUR HOURS COULD NOT ANSWER, AND WERE FIXED HERE (08-17). The first run read dawn 18.59 hot% at the
// light against 0.04 turned away and night 5.77 against 0.05 — the glint is directional and both of those are
// real. Noon read 25.34 at the light against 60.71 turned AWAY, and dusk read 87.21 against 84.28, and neither
// of those is a fault in the water:
//   NOON HAS NO HORIZON TRACK AND SHOULD NOT. A specular track sits where the eye's reflection meets the light,
//   so with the sun near the zenith it is at your FEET, not on the horizon. The old row aimed at a fixed pitch
//   of -0.05 and photographed sea that could not hold the highlight at that hour. Asking the question at noon
//   is asking for a thing whose absence is correct — mid-morning is where a track both exists and is visible,
//   so that is the hour now, and the pitch follows the light's elevation instead of being a constant.
//   pctHot SATURATES. At dusk the whole strip is over 140, so a count of pixels over 140 reads 87 against 84
//   and discriminates nothing. Contrast is the measure that survives an exposure change: the hottest decile of
//   the strip over its own median, which is a ratio a bright sky cannot inflate.
// And the night row ran at dayLock 0.94, which is nearly SUNRISE. Midnight is 0.75; this file had the same bug
// setTime(0.95) had.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// The sea strip: the band from the horizon down toward the shore, centre 60% of the width. max matters more than mean —
// a track is a few bright facets among dark ones, and a mean over the whole strip hides exactly that.
const STRIP=async(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
  const x0=Math.floor(W*0.20), x1=Math.floor(W*0.80), y0=Math.floor(H*0.50), y1=Math.floor(H*0.78);
  let sum=0,n=0,mx=0,hot=0; const all=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=(y*W+x)*4;
    const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; sum+=l; n++; if(l>mx)mx=l; if(l>140)hot++; all.push(l); }
  all.sort((a,b)=>a-b);
  const med=all[all.length>>1], p90=all[Math.floor(all.length*0.9)];
  return { mean:+(sum/n).toFixed(1), max:+mx.toFixed(0), pctHot:+(100*hot/n).toFixed(2),
           contrast:+(p90/Math.max(1,med)).toFixed(2) };   // hottest decile over the median: an exposure cannot inflate it
}, 'data:image/png;base64,'+fs.readFileSync(file).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(16000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    const prof=await page.evaluate('__hc.shoreProfile(36,2)');

    // f is the day fraction; moon:true aims at the moon instead, which is the sun's negation.
    const HOURS=[ {tag:'dawn', f:0.015, moon:false}, {tag:'morn', f:0.12, moon:false},
                  {tag:'dusk', f:0.485, moon:false}, {tag:'moonlow', f:0.58, moon:true}, {tag:'midnight', f:0.75, moon:true} ];
    for(const h of HOURS){
      const ang=h.f*Math.PI*2;
      let sx=Math.cos(ang), sz=0.35; if(h.moon){ sx=-sx; sz=-sz; }
      const want=Math.atan2(sz,sx)*180/Math.PI;
      // the bearing whose coast lies nearest the light's own azimuth, so the sea is where the track has to be
      const b=prof.perBearing.reduce((a,o)=>{ const dd=x=>Math.abs(((x-want)%360+540)%360-180);
        return dd(o.bearing)<dd(a.bearing)?o:a; }, prof.perBearing[0]);
      const th=b.bearing*Math.PI/180, cs=Math.cos(th), sn=Math.sin(th);
      const px=Math.round(500+cs*(b.coast-6)), pz=Math.round(0+sn*(b.coast-6));
      await page.evaluate('__hc.dayLock('+h.f+')');
      await page.evaluate('__hc.tp('+px+','+pz+')'); await sleep(7000);
      const shot=async(yaw,pitch,tag)=>{
        await page.evaluate('__hcBR.look('+yaw.toFixed(4)+','+pitch+')'); await sleep(2200);
        const f=path.join(OUT,'glint-'+tag+'.png'); await page.screenshot({path:f});
        return { tag, ...(await STRIP(page,f)) };
      };
      const toward=Math.atan2(-cs,-sn);
      // THE PITCH FOLLOWS THE LIGHT. elev = sin(2*pi*f) with the world's tilt, and the mirror direction for a
      // highlight is that elevation below the horizon — a constant pitch photographs whatever the sea is doing
      // at one angle and calls the absence of a highlight an absence of a glint.
      // AND THE MOON'S ELEVATION IS THE SUN'S NEGATED. tod().elev is the SUN's, so at midnight it reads -0.94,
      // which is a moon near the ZENITH and a moon track at your feet — the same geometry that made the old noon
      // row unanswerable. Taking |sun elev| for a moon hour re-created that trap in the fix for it. The moon row
      // therefore runs shortly after dusk, where the moon is LOW and its track is on the horizon where Ben looks.
      const _e=(await page.evaluate('__hc.tod()')).elev;
      const elev=h.moon?-_e:_e;
      const pit=Math.max(-0.62, -Math.abs(Math.asin(Math.max(-1,Math.min(1,elev))))*0.75);
      const on=await shot(toward,pit.toFixed(3),h.tag);
      const off=await shot(toward+Math.PI/2,pit.toFixed(3),h.tag+'-90deg');
      console.log(h.tag.padEnd(6)+' bearing '+String(b.bearing).padStart(4)+' (wanted '+want.toFixed(0)+')  elev '+elev.toFixed(2)+' pitch '+pit.toFixed(2)
        +'   AT THE LIGHT mean '+String(on.mean).padStart(6)+' max '+String(on.max).padStart(4)+' contrast '+String(on.contrast).padStart(5)
        +'   |  90 OFF mean '+String(off.mean).padStart(6)+' max '+String(off.max).padStart(4)+' contrast '+String(off.contrast).padStart(5));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
