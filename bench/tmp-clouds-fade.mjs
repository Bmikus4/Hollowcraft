// LOOK at the pines-to-band join and the daytime clouds, and TIME the sky.
//
// The 140fps pass is a standing constraint in this repo, so heavier clouds have to come with a number. Frames are timed with
// the camera pitched UP so cloud fragments fill the view -- that is the worst case for this shader and the only honest place
// to measure it. Timing the horizon instead would measure mostly terrain and report no cost at all.
//
// usage: node bench/tmp-clouds-fade.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
// VSYNC OFF. With the compositor's 144Hz cap in place every measurement came back as exactly 6.96 ms whatever the shader did,
// which is the cap and not the cost. Unlocking the frame rate makes rAF deltas reflect real GPU work, which is the only way an
// A/B of a fragment shader means anything.
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
  '--disable-gpu-vsync','--disable-frame-rate-limit'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const TAG=process.argv[2]||'after';
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    // ?perf=1 turns on the game's own per-frame GPU/CPU timers. Wall-clock rAF deltas are useless here: this machine vsyncs
    // at ~144Hz, so both the old and the new shader measure exactly 6.96 ms and the difference is invisible.
    await page.goto(base+'/index.html?debug=1&perf=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.30)');   // midday, where the clouds are meant to read
    await sleep(1200);

    // A frame-time recorder in the page. requestAnimationFrame deltas are what the player actually feels.
    await page.evaluate(`window.__ft={on:false,f:[]}; (function tick(t){ if(window.__ft.on){ if(window.__ft.last) window.__ft.f.push(t-window.__ft.last); window.__ft.last=t; } else window.__ft.last=0; requestAnimationFrame(tick); })(performance.now());`);
    const time=async(label)=>{ await page.evaluate('window.__ft.f=[]; window.__ft.on=true; window.__ft.last=0;');
      await sleep(4000);
      const f=await page.evaluate('(()=>{ window.__ft.on=false; return window.__ft.f.slice(); })()');
      f.sort((a,b)=>a-b);
      const med=f[f.length>>1]||0, p95=f[Math.floor(f.length*0.95)]||0;
      console.log('  '+label.padEnd(26)+' frames='+String(f.length).padStart(4)+'  median '+med.toFixed(2)+' ms  p95 '+p95.toFixed(2)+' ms');
      return {med,p95,n:f.length}; };

    // THE COST OF THE CLOUD BRANCH, measured by the game's own GPU timers with the sky filling the view: clouds on against
    // clouds off, same camera, same frame. uCloud=0 makes the coverage term zero, which skips the self-shadow sample and all
    // the cloud shading, so the difference is what the branch costs.
    const gpu=async(label)=>{ const t=await time(label); const p=await page.evaluate('__hc.frameProf(180)');
      if(p && !p.err) console.log('     game-side avgFrameMs '+p.avgFrameMs+'   heaviest CPU segments '+JSON.stringify(Object.entries(p.ms||{}).slice(0,3)));
      return {frame:{med:t.med,p95:t.p95}}; };

    // Let chunk STREAMING quiesce first, and alternate the toggle. The first attempt measured clouds-ON while the world was
    // still streaming -- 7.0 ms of 'stream' against 0.36 ms in the clouds-OFF window -- so it reported the streamer, not the
    // shader. Alternating also means an ordering effect cannot masquerade as the cost.
    await page.evaluate('__hcBR.look(0.6,0.85)'); await sleep(9000);
    const ons=[], offs=[];
    for(let i=0;i<3;i++){
      await page.evaluate('__hc.vis({cloud:0})'); await sleep(600); offs.push((await gpu('sky full, clouds OFF #'+(i+1))).frame.med);
      await page.evaluate('__hc.vis({cloud:1})'); await sleep(600); ons.push((await gpu('sky full, clouds ON  #'+(i+1))).frame.med);
    }
    const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
    const mOn=mean(ons), mOff=mean(offs);
    console.log('\n  CLOUD BRANCH COST, sky filling the view: ON '+mOn.toFixed(2)+' ms vs OFF '+mOff.toFixed(2)+' ms  ->  '
      +(mOn-mOff).toFixed(2)+' ms  ('+ons.map(v=>v.toFixed(2)).join('/')+' vs '+offs.map(v=>v.toFixed(2)).join('/')+')');
    const skyOn={frame:{med:mOn}}, skyOff={frame:{med:mOff}};
    await page.screenshot({ path: path.join(OUT,'clouds-'+TAG+'-up.png') });
    // A CAMERA THAT CAN SEE CLOUDS. cp = dir/(dir.y*0.9+0.1) is a flat-plane projection, so near the zenith dir.xz goes to
    // zero and the whole visible sky samples almost one point of the noise -- looking steeply up photographs a single gap and
    // says nothing about coverage. 15-25 degrees above the horizon is where the plane spreads across the frame.
    for(const [nm,pitch] of [['sky20',0.34],['sky12',0.21]]){
      await page.evaluate('__hcBR.look(0.6,'+pitch+')'); await sleep(1100);
      await page.screenshot({ path: path.join(OUT,'clouds-'+TAG+'-'+nm+'.png') });
    }
    // And the same view with clouds off, so "is that cloud or is that sky" is answerable by comparison.
    await page.evaluate('__hc.vis({cloud:0})'); await sleep(900);
    await page.screenshot({ path: path.join(OUT,'clouds-'+TAG+'-sky12-nocloud.png') });
    await page.evaluate('__hc.vis({cloud:1})'); await sleep(600);

    // A NORMAL PLAYING VIEW, for the number that matters day to day.
    await page.evaluate('__hcBR.look(0.6,-0.05)'); await sleep(1200);
    const level=await gpu('level, normal play');
    const sky=skyOn;
    await page.screenshot({ path: path.join(OUT,'clouds-'+TAG+'-level.png') });

    // THE JOIN: stand back from the treeline and look at where the pines meet the woody band.
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2200);
    // Four bearings, because the treeline is only on the land side and guessing one yaw photographed open sea.
    for(let i=0;i<4;i++){ const yaw=i*Math.PI/2;
      await page.evaluate('__hcBR.look('+yaw+',0.012)'); await sleep(900);
      await page.screenshot({ path: path.join(OUT,'clouds-'+TAG+'-treeline'+i+'.png') }); }

    console.log('\nJSON '+JSON.stringify({tag:TAG, sky, level}));
    console.log('shots: bench/results/clouds-'+TAG+'-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
