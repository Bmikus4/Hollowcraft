// THE HORIZON AT FOUR HOURS, FROM THE SHORE. Ben, verifying the treeline swap: it "must be updated with all of the post
// processing and shaders" — affected by fog, the time-of-day grade, the dusk haze, exposure, bloom, the weather. A backdrop
// that keeps its own brightness while the world dims is instantly readable as a painting stuck behind the world, and that
// is most of why the last one read as trash.
//
// So this shoots the same view at noon, dusk, night and in rain, and MEASURES the band as well as saving it: the mean
// luminance of the treeline's own rows and of the sky just above them. The claim "it changes with the world" is that those
// numbers move together across the four frames — a painted-on band holds its value while the sky's falls.
//
// It also measures the VERTICAL EXTENT in degrees, because "they extend well out into the sky" is Ben's complaint and it is
// a number: rows containing treeline, converted through the frame's own degrees-per-pixel.
//
//   node bench/look-horizon.mjs   → bench/results/horizon/<hour>.png
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/horizon');
const W=1200, H=700;
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
function pixels(file){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) throw new Error('ffmpeg failed on '+file); return r.stdout; }
// Row luminance profile across the middle half of the frame, so the HUD down the left and any object at the edges cannot
// contribute. The treeline is found as the rows that are DARKER and GREENER than the sky above them.
function rows(buf){
  const x0=W*0.25|0, x1=W*0.75|0, out=[];
  for(let y=0;y<H;y++){ let L=0, g=0, n=0;
    for(let x=x0;x<x1;x++){ const i=(y*W+x)*3;
      L+=(buf[i]*0.2126+buf[i+1]*0.7152+buf[i+2]*0.0722)/255;
      g+=(buf[i+1]-(buf[i]+buf[i+2])/2)/255; n++; }
    out.push({y, L:L/n, g:g/n}); }
  return out;
}
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    fs.mkdirSync(OUT,{recursive:true});
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)');
    // FROM THE SHORE AT EYE HEIGHT AND LEVEL, which is how Ben judges it. Pitch 0 puts the horizon across the middle of
    // the frame; any tilt turns "how many degrees of sky" into a number about the camera instead of about the treeline.
    await ev('__hc.cam({pitch:0})');
    console.log('  pines '+JSON.stringify(await ev('__hc.pines()')));
    // FIND THE COAST BEFORE PHOTOGRAPHING IT. The band only draws where the island really continues past the render wall,
    // so a yaw picked by hand photographs open sea and proves nothing either way. Sweep, and keep the bearing whose upper
    // half of frame holds the most dark-and-green rows — the treeline against the sky.
    let bestYaw=0, bestN=-1;
    for(let i=0;i<16;i++){
      const y=i*Math.PI/8; await ev(`__hc.cam({yaw:${y.toFixed(4)}, pitch:0})`); await sleep(320);
      const f=path.join(OUT,'_sweep.png'); await pg.screenshot({path:f});
      const R=rows(pixels(f));
      const sky=R.slice(H*0.18|0,H*0.34|0).reduce((a,r)=>a+r.L,0)/(((H*0.34|0)-(H*0.18|0))||1);
      const n=R.slice(H*0.36|0,H*0.52|0).filter(r=>r.L<sky*0.80 && r.g>0.004).length;
      if(n>bestN){ bestN=n; bestYaw=y; } }
    await ev(`__hc.cam({yaw:${bestYaw.toFixed(4)}, pitch:0})`);
    console.log('  best bearing '+(bestYaw*180/Math.PI).toFixed(0)+' deg, '+bestN+' treeline rows');
    const degPerPx=await ev('(180/Math.PI)*((camera.fov*Math.PI/180)/'+H+')').catch(()=>null);
    const dpp=degPerPx || (70/H);

    const shot=async(tag, t, wx)=>{
      await ev('__hc.setTime('+t+')');
      if(wx!=null) await ev('__hc.weather ? __hc.weather('+wx+') : null');
      await sleep(1400);
      const f=path.join(OUT,tag+'.png'); await pg.screenshot({path:f});
      const R=rows(pixels(f));
      // The sky sample is the band of rows above the horizon that is never treeline; the treeline is the darker-and-greener
      // run just below it. Both are read from the same frame so exposure and the grade are common to them.
      const skyBand=R.slice(H*0.18|0, H*0.34|0);
      const sky=skyBand.reduce((a,r)=>a+r.L,0)/skyBand.length;
      const cand=R.slice(H*0.34|0, H*0.62|0).filter(r=>r.L<sky*0.82);
      const band=cand.length?{lo:cand[0].y, hi:cand[cand.length-1].y,
        L:+(cand.reduce((a,r)=>a+r.L,0)/cand.length).toFixed(4)}:null;
      console.log('  '+tag.padEnd(8)+'sky '+sky.toFixed(4)
        +'   treeline '+(band?band.L.toFixed(4):'  none  ')
        +'   ratio '+(band?(band.L/Math.max(sky,1e-4)).toFixed(3):'   -  ')
        +'   extent '+(band?((band.hi-band.lo+1)*dpp).toFixed(2)+' deg':'  -  ')
        +'   '+f);
      return {tag, sky, band};
    };

    const out=[];
    out.push(await shot('noon',  0.30, 0));
    out.push(await shot('dusk',  0.62, 0));
    out.push(await shot('night', 0.85, 0));
    out.push(await shot('rain',  0.30, 1));
    await ev('__hc.weather ? __hc.weather(0) : null');

    // THE CLAIM, AS A NUMBER. If the band is lit by the world it dims with it; if it is painted on it holds its value while
    // the sky's collapses. Reported rather than asserted, because "how much darker at dusk" is Ben's eye to settle.
    const day=out[0], night=out[2];
    if(day.band && night.band)
      console.log('\n  sky noon->night x'+(night.sky/day.sky).toFixed(3)
                 +'   treeline noon->night x'+(night.band.L/day.band.L).toFixed(3));
    console.log('  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
