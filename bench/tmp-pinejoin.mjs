// THE PINES-TO-BAND JOIN, magnified and measured. Ben, after the first fade: "the clouds look way better, but the pines
// still contrast." So there is still a visible edge where the distant treeline meets the woody band, in the shore view.
//
// A vertical luminance profile through the treeline is what "a visible edge" means as a number: average each row across a
// band of columns and look for the biggest row-to-row jump. A gradient has small steps everywhere; an edge is one big one.
// The crop is also saved magnified, because the eye is the final judge and a 1280-wide frame hides a 3-pixel line.
//
// usage: node bench/tmp-pinejoin.mjs <tag>
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const TAG=process.argv[2]||'now';
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.30)');
    await page.evaluate('__hc.pinScene()');

    // THE SHORE VIEW Ben was given: on the beach, looking along the coast so the far treeline crosses the frame.
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2600);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(1400);

    // DAY AND NIGHT, because Ben's complaint is "it wasnt darkened either, day or night" -- the band has to read as dark wood
    // at both, and the daylight haze is the thing that can wash it out.
    for(const [nm,t] of [['day',0.30],['night',0.66]]){
      await page.evaluate('__hc.setTime('+t+')'); await sleep(1300);
      const f2=path.join(OUT,'pinejoin-'+TAG+'-'+nm+'.png');
      await page.screenshot({path:f2});
      const im2=decodePNG(fs.readFileSync(f2));
      const Lf=(x,y)=>{ const i=(y*im2.w+x)*im2.ch; return 0.2126*im2.data[i]+0.7152*im2.data[i+1]+0.0722*im2.data[i+2]; };
      const rows=[];
      for(let y=Math.floor(im2.h*0.30); y<Math.floor(im2.h*0.68); y++){
        let r=0,g=0,b=0,n=0; for(let x=Math.floor(im2.w*0.30);x<Math.floor(im2.w*0.62);x++){ const i=(y*im2.w+x)*im2.ch; r+=im2.data[i]; g+=im2.data[i+1]; b+=im2.data[i+2]; n++; }
        rows.push({y, rgb:[r/n,g/n,b/n], lum:Lf(Math.floor(im2.w*0.45),y)});
      }
      let gy2=rows[0].y, gb=-1e9;
      for(const p of rows){ const green=p.rgb[1]-(p.rgb[0]+p.rgb[2])/2; if(green>gb){ gb=green; gy2=p.y; } }
      const at=(y)=>rows.find(p=>p.y===y);
      const canopy=at(gy2), band=at(gy2+26), below=at(gy2+42);
      const fmt=p=>p?('rgb('+p.rgb.map(v=>Math.round(v)).join(',')+')'):'?';
      const lum=p=>p?(0.2126*p.rgb[0]+0.7152*p.rgb[1]+0.0722*p.rgb[2]):0;
      // HOW FAR UP DOES THE BROWN REACH? Ben: "the brown part of the pines exists but it is too low." Brown is r>=g here --
      // foliage is green-dominant and the band is red-dominant -- so the first brown row below the canopy is where the wood
      // starts, and its distance from the canopy is the thing he is describing.
      let firstBrown=null, lastBrown=null;
      for(const p of rows){ if(p.y<gy2) continue; const brown=p.rgb[0]>=p.rgb[1]*0.99;
        if(brown){ if(firstBrown==null) firstBrown=p.y; lastBrown=p.y; } else if(firstBrown!=null && p.y>firstBrown+4) break; }
      console.log('     brown starts '+(firstBrown!=null?(firstBrown-gy2)+' rows below the canopy, runs to +'+(lastBrown-gy2):'not found'));
      console.log('  '+nm.padEnd(6)+' canopy y'+gy2+' '+fmt(canopy)+' lum '+lum(canopy).toFixed(0)
        +'   band(+26) '+fmt(band)+' lum '+lum(band).toFixed(0)
        +'   base(+42) '+fmt(below)+' lum '+lum(below).toFixed(0)
        +'   band is '+(canopy&&band?Math.round(100*(1-lum(band)/Math.max(1,lum(canopy)))):0)+'% darker than the canopy');
    }
    // AND IN A FOG BANK. Ben: the brown bottom is not affected by fog. So the same view with the weather fog forced up -- the
    // band has to wash toward the haze with the treeline instead of staying a hard dark strip through it.
    await page.evaluate('__hc.setTime(0.30)'); await sleep(1000);
    await page.evaluate('(()=>{ try{ return __hc.fog(0.85); }catch(e){ return __hc.cmdRun("/weather fog 0.85"); } })()');
    await sleep(4000);
    {
      const f3=path.join(OUT,'pinejoin-'+TAG+'-fog.png');
      await page.screenshot({path:f3});
      const im3=decodePNG(fs.readFileSync(f3));
      let r=0,g=0,b=0,n=0;
      const gy3=Math.floor(im3.h*0.46);
      for(let y=gy3;y<gy3+26;y++) for(let x=Math.floor(im3.w*0.30);x<Math.floor(im3.w*0.62);x++){ const i=(y*im3.w+x)*im3.ch; r+=im3.data[i]; g+=im3.data[i+1]; b+=im3.data[i+2]; n++; }
      console.log('  in fog: band rows read rgb('+[r/n,g/n,b/n].map(v=>Math.round(v)).join(',')+')  — should be pale haze, not dark wood');
    }
    await page.evaluate('(()=>{ try{ return __hc.fog(0); }catch(e){ return __hc.cmdRun("/weather clear"); } })()');
    await sleep(3500);

    const full=path.join(OUT,'pinejoin-'+TAG+'.png');
    await page.screenshot({path:full});
    const img=decodePNG(fs.readFileSync(full));
    const L=(x,y)=>{ const i=(y*img.w+x)*img.ch; return 0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2]; };
    const RGB=(x,y)=>{ const i=(y*img.w+x)*img.ch; return [img.data[i],img.data[i+1],img.data[i+2]]; };

    // Columns through the middle-left, where the treeline runs; rows from well above the canopy to well below the waterline.
    const x0=Math.floor(img.w*0.30), x1=Math.floor(img.w*0.62);
    const prof=[];
    for(let y=Math.floor(img.h*0.30); y<Math.floor(img.h*0.72); y++){
      let s=0,n=0,r=0,g=0,b=0; for(let x=x0;x<x1;x++){ s+=L(x,y); const c=RGB(x,y); r+=c[0]; g+=c[1]; b+=c[2]; n++; }
      prof.push({y, lum:s/n, rgb:[Math.round(r/n),Math.round(g/n),Math.round(b/n)]});
    }
    // FIND THE TREELINE BY ITS COLOUR, do not assume a row range. The first version profiled a window that included the beach
    // and reported the sand/water boundary as the worst step -- a real edge, just not the one Ben is looking at. The distant
    // pines are the only green thing up there, so the greenest row is the canopy and the join is just below it.
    let gBest=-1e9, gy=prof[0].y;
    for(const p of prof){ const green=p.rgb[1]-(p.rgb[0]+p.rgb[2])/2; if(green>gBest){ gBest=green; gy=p.y; } }
    console.log('  greenest row (canopy) y='+gy+'  greenness '+gBest.toFixed(1));
    // ONLY THE BAND'S OWN ROWS. A 70-row window reaches past the band into the beach, and the grass-to-sand boundary of the
    // real terrain is a genuine 30-luminance edge that has nothing to do with this shader -- it was reported as the join twice.
    // The band is uBandH=5 blocks at treeline distance, which is a few dozen rows; 34 covers the fade and stops short of land.
    const lo=gy, hi=gy+34;
    let worst=0, wy=lo;
    for(let i=1;i<prof.length;i++){ const p=prof[i]; if(p.y<lo||p.y>hi) continue;
      const d=Math.abs(p.lum-prof[i-1].lum); if(d>worst){ worst=d; wy=p.y; } }
    console.log('  biggest row-to-row luminance step: '+worst.toFixed(2)+' at y='+wy);
    // The rows either side of the worst step, so the two colours meeting there are named rather than guessed at.
    const at=(y)=>{ const p=prof.find(p=>p.y===y); return p?('y'+y+' rgb('+p.rgb.join(',')+') lum '+p.lum.toFixed(1)):'?'; };
    for(const dy of [-10,-5,-2,0,2,5,10]) console.log('     '+at(wy+dy));

    // MAGNIFIED CROP around the join, because a three-pixel line is invisible at 1280 wide and obvious at 4x.
    // Anchored on the CANOPY row, not the worst step: the worst step wanders onto terrain and the crop went with it.
    await page.screenshot({ path: path.join(OUT,'pinejoin-'+TAG+'-zoom.png'),
      clip:{ x:x0, y:Math.max(0,gy-26), width:Math.min(520,x1-x0), height:110 } });
    console.log('  shots: bench/results/pinejoin-'+TAG+'.png (+ -zoom.png)');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
