// THE FLUORESCENT CLATTER, A/B'd IN ONE RUN. Ben 08-04: "proper sounds (no drops...)".
//
// "fluorout" is literally the tube-dropout sample. Measured in the halls: 81 sample triggers in 40 s from FOUR distinct
// fixtures, one of them accounting for 38 on its own at 6 blocks away. The cause is not the flicker rate and not the
// fixture count — it is that the sample was bound to brFlick's per-FRAME on/off, which inside a strobe burst is
// Math.sin(t*41+ph*5)>0 and crosses zero ~6.5 times a second. One tube, ~13 sounds a second.
//
// BOTH ARMS RUN IN ONE PAGE, ON ONE SEED, so the maze, the fixture set and the walk are identical and the ONLY difference
// is BR._sndFix. Two separate runs would re-roll the maze — the Backrooms seed is deliberately random per door — and the
// comparison would be worthless.
//
// usage: HC_ROOT=<pinned> node bench/br-fluor-ab.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);

// The same walk both times, from the same point, so the fixture set encountered is the same.
const ARM=(secs)=>`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
  __hcBR.walk(true,true); let last=await f(); const d=[]; const t0=performance.now(); let yaw=0;
  while(performance.now()-t0 < ${secs*1000}){ yaw+=0.004; __hcBR.face(yaw);
    const t=await f(); const ms=t-last; last=t; if(performance.now()-t0>=3000) d.push(ms); }
  __hcBR.walk(false); const n=d.length; d.sort((a,b)=>a-b);
  return { frames:n, median:+d[n>>1].toFixed(2), p99:+d[Math.floor(n*0.99)].toFixed(2) }; })()`;

(async()=>{
  console.log('pinned tree: '+ROOT);
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    const ev=async(js,tag)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,150), at:tag}; } };

    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000); await page.mouse.click(640,360); await sleep(1200);
    await ev('__hc.cmdRun("/gamemode creative")');
    await ev('__hcBR.enter()'); await sleep(9000);
    await ev('__hcBR.seed(99991)'); await sleep(4000);          // ONE maze for both arms
    const home=await ev('__hcBR.stat2()','home');
    console.log('seed pinned, state: '+J(home));

    const arm=async(fix,label)=>{
      await ev('__hcBR.sndFix('+fix+')');
      await ev(`(()=>{ player.pos.set(${home.x},${home.y},${home.z}); player.vel.set(0,0,0); player.yaw=0; })()`);
      await sleep(2500);
      await ev('__hcBR.fluorLog(true)'); await ev('__hcAUD.tap(true)');
      const fr=await ev(ARM(40),'arm');
      const fc=await ev('__hcBR.fluorCensus()','fc');
      const ec=await ev('__hcAUD.census()','ec');
      console.log('\n--- '+label);
      console.log('  fluor    '+J(fc));
      console.log('  emitters '+J(ec));
      console.log('  frames   '+J(fr));
      return fc;
    };
    const before=await arm(false,'A · OLD, sound bound to the strobe toggle');
    const after =await arm(true, 'B · NEW, sound bound to the tube state + 2.5s per-fixture cooldown');

    console.log('\n=== VERDICT ===');
    if(before&&after&&before.events!=null&&after.events!=null){
      console.log('  triggers        '+before.events+' -> '+after.events
        +'   ('+(before.events?(100*(before.events-after.events)/before.events).toFixed(0):'-')+'% fewer)');
      console.log('  worst one tube  '+before.perFixtureMax+' -> '+after.perFixtureMax);
      console.log('  distinct tubes  '+before.distinctFixtures+' -> '+after.distinctFixtures
        +'   (this should NOT collapse — silencing tubes is not the fix, spacing them is)');
    }
    console.log('\npage errors: '+(errs.length?errs.slice(0,8).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
