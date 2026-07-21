// STAGE II (THE ZEALOT) VERIFIER — wing rake feathers fly/stick/detonate, sweep locks a line, prayer pauses fire
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }
(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=630', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2000);
    const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };

    await page.evaluate(`__hc.boss({park:true, dist:30, up:12})`);
    await sleep(8500);
    await page.evaluate(`__hc.heal()`);
    // force it into life II with an imminent storm + beam
    await page.evaluate(`__hc.set({_bossPhase:2, _rakeCd:0.2, _laserCd:2.0, _cycleN:2, _regenT:0, _park:false})`);
    // the STORM: 50-70 feathers blanket the area — sample the peak while they are airborne
    let peak=0; for(let i=0;i<16;i++){ await page.evaluate(`__hc.heal()`); const s=await page.evaluate(`__hc.stage2()`); peak=Math.max(peak,s.feathers); await sleep(150); }
    ck('feather STORM (>=40 feathers at once)', peak>=40, {peak});
    await page.screenshot({ path: path.join(OUT,'stage2-rake.png') });
    let s2 = await page.evaluate(`__hc.stage2()`);
    // the beam cycle in phase 2 locks a SWEEP line
    for(let i=0;i<30;i++){ await page.evaluate(`__hc.heal()`); s2=await page.evaluate(`__hc.stage2()`); if(s2.laser==='warn'||s2.laser==='fire')break; await sleep(400); }
    ck('phase-2 beam locked a sweep line', s2.sweep===true && (s2.laser==='warn'||s2.laser==='fire'), s2);
    // ride to a 3rd-cycle PRAYER: park the natural scheduler on cycle 2, force ONE beam to complete → cycle 3 → pray
    await page.evaluate(`__hc.heal()`);
    await page.evaluate(`__hc.set({_cycleN:2, _laserCd:99, _prayT:0, _laserState:'fire', _laserT:0.3, _laserA:null, _laserAim:{x:0,y:50,z:0}})`);
    for(let i=0;i<12;i++){ await page.evaluate(`__hc.heal()`); s2=await page.evaluate(`__hc.stage2()`); if(s2.pray>0||s2.cycles>=3)break; await sleep(200); }
    ck('third cycle entered PRAYER', s2.pray>0 || s2.cycles>=3, s2);
    ck('zero page errors', errors.length===0, errors);
    const pass=fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close(); process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
