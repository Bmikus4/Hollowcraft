// WHAT THE FLUORESCENT POOL SIZE IS WORTH. Ben: "lighting is not showing from the ceiling", then, once the cause was pinned,
// "do the pool size, bump it".
//
// THE CAUSE, measured: BR.lightPool takes the nearest N fixtures within 95 blocks and nothing else in the halls emits light at
// all. At N=16 it was SATURATED -- BR._litNear pinned at 16 against 213 fixtures on the ceilings -- so raising the lit-room
// count from 6.6% to 47% put 200-odd tubes in a 16-slot queue and the mean luminance FELL, 50.3 to 47.7. The other route,
// baking br_fluor's light:15 into the ceiling voxels, was tried and measured DARKER (35.81 against 36.50): the interior is mesh
// geometry in BR.env and voxel block-light never reaches it. The pool is the only lever there is.
//
// So this sweeps the size on ONE page from ONE camera and reports, per size: how many tubes are actually lit, the mean
// luminance of the frame, and the frame time. All three are needed -- brightness that costs 3x the frame is not a fix, and a
// bigger pool that does not raise litNear is not doing anything.
//
// Paired in time and re-measured at the baseline LAST (16 -> 32 -> 48 -> 16), because a drifting frame would otherwise read as
// a lighting gain. Every light is a per-fragment loop iteration in every material, so the cost is real and monotonic.
//
// usage: node bench/assert-br-pool-size.mjs   -> bench/results/br-pool-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            // VSYNC OFF, or the frame time is the DISPLAY's and not the renderer's. The first run of this reported 6.94 ms at
            // every pool size, to two decimals, at 16 and 32 and 48 — which is 1000/144 exactly. It was measuring the refresh
            // rate. An unclamped rAF is the only way this number says anything about what a light costs.
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:900,height:560}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return null; } })()');
    await sleep(9000);
    ok('the player is inside the Backrooms', (await page.evaluate('(()=>{ const s=__hcBR.state?__hcBR.state():null; return !!(s&&s.inside); })()'))===true);

    // Stand in the biggest LIT hall we can find, so the frame has ceilings in it and the pool has something to compete over.
    // A room that comes back lit:false has no fixtures at all and every size would read identically -- that mistake was made
    // once already on the baked-light attempt and produced two 27.60s.
    let room=null;
    for(const z of [0,1,2]){ const p=await page.evaluate('__hcBR.roomPick('+z+',true)');
      if(p && p.x!=null && p.lit){ room=p; break; } }
    if(!room) room=await page.evaluate('__hcBR.roomPick(0,true)');
    console.log('  target room: '+JSON.stringify(room));
    await page.evaluate('(()=>{ const q=__hc.probe(); __hc.tpExact('+room.x+','+room.z+', q.y); })()');
    await sleep(6000);
    const here=await page.evaluate('__hcBR.roomAt()');
    console.log('  standing in: '+JSON.stringify(here && {zone:here.zone, lit:here.lit, cells:here.cells}));
    ok('standing in a LIT room, so the pool has work to do', !!(here && here.lit), here && here.lit);
    await page.evaluate('__hcBR.look(0,-0.03)'); await sleep(1500);

    // FRAME TIME from rAF deltas, with the first samples discarded: resizing the pool moves the point-light count, which
    // recompiles every material, and those compile frames are a bench artefact of the resize rather than the cost of the size.
    const measure=async(n,tag)=>{
      const set=await page.evaluate('__hcPERF.lightPool('+n+')');
      await sleep(4500);                                                   // let the compile storm from the resize pass
      const fr=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
        let last=await f(); const d=[];
        for(let i=0;i<90;i++){ const t=await f(); d.push(t-last); last=t; }
        d.splice(0,20); d.sort((a,b)=>a-b);                                // drop the first 20 and take the median
        return { median:+d[d.length>>1].toFixed(2), p90:+d[Math.floor(d.length*0.9)].toFixed(2) }; })()`);
      const st=await page.evaluate('__hcPERF.lightPool()');
      const p=path.join(OUT,'br-pool-'+tag+'.png'); await page.screenshot({path:p});
      const { decodePNG }=await import('./pngprobe.mjs'); const img=decodePNG(fs.readFileSync(p));
      let s=0,c=0; for(let y=0;y<Math.floor(img.h*0.82);y++) for(let x=0;x<img.w;x++){ const i=(y*img.w+x)*img.ch;   // 0.82 keeps the HUD out of the mean
        s+=0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2]; c++; }
      return { size:st.size, litNear:st.litNear, fixtures:st.fixtures, lum:+(s/c).toFixed(2), ms:fr.median, p90:fr.p90 };
    };

    const r16=await measure(16,'16');   console.log('  pool 16: '+JSON.stringify(r16));
    const r32=await measure(32,'32');   console.log('  pool 32: '+JSON.stringify(r32));
    const r48=await measure(48,'48');   console.log('  pool 48: '+JSON.stringify(r48));
    const rBack=await measure(16,'16b');console.log('  pool 16 again: '+JSON.stringify(rBack));

    ok('16 slots really were saturated', r16.litNear>=15 && r16.fixtures>r16.size,
      {litNear:r16.litNear, of:r16.size, fixtures:r16.fixtures});
    ok('32 slots light more tubes than 16', r32.litNear>r16.litNear, {at16:r16.litNear, at32:r32.litNear});
    ok('and the hall is measurably brighter for it', r32.lum>r16.lum, {at16:r16.lum, at32:r32.lum, gain:+(r32.lum-r16.lum).toFixed(2)});
    // A/B/A: the two 16 readings must agree, or the frame drifted and the gain above is not the pool's doing.
    ok('the two 16-slot readings agree, so the sweep is comparable', Math.abs(r16.lum-rBack.lum) < Math.max(0.8,(r32.lum-r16.lum)*0.5),
      {first:r16.lum, again:rBack.lum, gain:+(r32.lum-r16.lum).toFixed(2)});
    // COST, against its own NOISE FLOOR. The A/B/A pair gives the floor for free: the two 16-slot readings differ by as much as
    // the sweep does, so a bare "32 costs 0.17 ms more than 16" would be reading noise as signal. Measured once at
    // 2.01 / 2.18 / 2.56 / 2.45 ms for 16 / 32 / 48 / 16 — the 16-to-16 drift (0.44) is larger than the 16-to-32 step (0.17),
    // so 32 costs less than this harness can resolve and only 48 rises clear of the band.
    const floor=Math.abs(r16.ms-rBack.ms);
    console.log('  frame time  16: '+r16.ms+'ms   32: '+r32.ms+'ms   48: '+r48.ms+'ms   (16 again '+rBack.ms+'ms'
      +'  → noise floor '+floor.toFixed(2)+'ms)');
    // Two runs of this measured the 16→32 step at 0.17 ms and 0.12 ms, against A/B/A drifts of 0.44 ms and 0.02 ms. So the step
    // is sometimes inside the noise and sometimes just clear of it, and either way it is a tenth of a millisecond — which is
    // what the 0.35 absolute bound is for. Noise alone would make this check pass or fail on which run you happened to take.
    ok('32 slots cost a fraction of a millisecond', (r32.ms-r16.ms) <= Math.max(floor,0.35),
      {step:+(r32.ms-r16.ms).toFixed(2), noiseFloor:+floor.toFixed(2)});
    ok('and are nowhere near a 60fps budget either way', r32.ms<16.7, {ms:r32.ms});
    // 48 is reported, not asserted: it is the reason to STOP at 32. It lights 6 more tubes for +0.73 luminance and is the only
    // size whose cost clears the noise band — the pool has run out of fixtures within a light's 56-block reach by then.
    console.log('  48 for reference: litNear '+r48.litNear+', luminance '+r48.lum+' (+'+(r48.lum-r32.lum).toFixed(2)+' over 32), '+r48.ms+'ms');

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
