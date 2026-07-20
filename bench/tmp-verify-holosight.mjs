// HOLOSIGHT REWORK VERIFIER — headless assertions over the whole gun rework:
//  A. XPS ADS: crosshair fades to 0, camera reticle visible, no scope lens on dot rifles
//  B. Fire NEVER breaks ADS (AR, dot rifle mid-bolt-cycle, scoped rifle) — all firearms
//  C. Recoil: pitch kicks UP smoothly on fire, then partially recovers (walk-up retained)
//  D. Magazines: AR 20 / rifle 5 / Python 6; dry fire -> auto reload -> mag refilled from reserve
//   node bench/tmp-verify-holosight.mjs
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
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2500);
    const S = () => page.evaluate(`__hc.sight()`);
    const fails=[]; const ck=(name,cond,info)=>{ if(!cond) fails.push(name+' :: '+JSON.stringify(info)); };

    // ---------- A+B+C: AR-15 with XPS ----------
    await page.evaluate(`__hc.gun('ar15_dot')`); await sleep(400);
    let s0=await S();
    ck('hip: crosshair visible', s0.xhOp>0.7, s0);
    ck('hip: reticle hidden', !s0.retVis, s0);
    await page.evaluate(`__hc.aim(true)`); await sleep(900);
    let s1=await S();
    ck('ADS on', s1.ads===true && s1.adsT>0.9, s1);
    ck('ADS: crosshair gone', s1.xhOp<0.05, s1);
    ck('ADS: holo reticle visible+lit', s1.retVis===true && s1.retOp>0.6, s1);
    ck('AR mag starts full (20)', s1.mag===20, s1);
    await page.screenshot({ path: path.join(OUT,'holo-ar-ads.png') });
    const p0=s1.pitch;
    await page.evaluate(`__hc.shoot()`); await sleep(130);
    let s2=await S();
    ck('fire kept ADS', s2.ads===true && s2.adsT>0.85, s2);
    ck('recoil kicked pitch UP', s2.pitch>p0+0.003, {p0, p1:s2.pitch});
    ck('mag decremented', s2.mag===19, s2);
    const pk=s2.pitch;
    await sleep(1300);
    let s3=await S();
    ck('recoil recovered smoothly (partial)', s3.pitch<pk-0.001 && s3.pitch>p0, {p0, pk, pf:s3.pitch});
    ck('still ADS after recovery', s3.ads===true, s3);
    // D: burn the mag -> dry fire -> auto reload
    for(let i=0;i<19;i++){ await page.evaluate(`__hc.shoot()`); await sleep(35); }
    let s4=await S(); ck('mag empty after 20 shots', s4.mag===0, s4);
    await page.evaluate(`__hc.shoot()`); await sleep(200);   // dry click -> auto reload starts, ADS drops during reload
    let s5=await S(); ck('auto-reload started', s5.reloadT>0.5, s5);
    await sleep(2600);
    let s6=await S(); ck('AR reloaded to 20 from reserve', s6.mag===20 && s6.reloadT===0, s6);
    ck('ADS re-raised after reload (rmb still held)', s6.ads===true, s6);
    await page.evaluate(`__hc.aim(false)`); await sleep(700);
    let s7=await S(); ck('lowered: crosshair back', s7.xhOp>0.7 && !s7.retVis, s7);
    await page.screenshot({ path: path.join(OUT,'holo-ar-hip.png') });

    // ---------- dot BOLT rifle: no scope lens, ADS survives the bolt cycle, mag=5 ----------
    await page.evaluate(`__hc.gun('hunting_rifle_dot')`); await sleep(400);
    let b0=await S();
    ck('dot rifle has NO scope lens', b0.scopeLens===false, b0);
    ck('rifle mag = 5', b0.mag===5, b0);
    await page.evaluate(`__hc.aim(true)`); await sleep(900);
    await page.screenshot({ path: path.join(OUT,'holo-rifle-ads.png') });
    await page.evaluate(`__hc.shoot()`); await sleep(300);
    let b1=await S();
    ck('bolt cycling', b1.boltT>0.3, b1);
    ck('ADS SURVIVES the bolt cycle', b1.ads===true && b1.adsT>0.8, b1);

    // ---------- scoped rifle keeps its scope + also never drops ADS on fire ----------
    await page.evaluate(`__hc.gun('hunting_rifle')`); await sleep(400);
    let c0=await S(); ck('plain rifle KEEPS scope lens', c0.scopeLens===true, c0);
    await page.evaluate(`__hc.aim(true)`); await sleep(900);
    await page.evaluate(`__hc.shoot()`); await sleep(300);
    let c1=await S(); ck('scoped rifle: ADS survives fire too', c1.ads===true && c1.adsT>0.8, c1);
    ck('scoped ADS: no holo reticle', !c1.retVis, c1);
    await page.evaluate(`__hc.aim(false)`);

    // ---------- Python: mag 6 + reload anim state ----------
    await page.evaluate(`__hc.gun('revolver')`); await sleep(400);
    let r0=await S(); ck('Python mag = 6', r0.mag===6, r0);
    for(let i=0;i<6;i++){ await page.evaluate(`__hc.shoot()`); await sleep(60); }
    let r1=await S(); ck('Python empty after 6', r1.mag===0, r1);
    await page.evaluate(`__hc.shoot()`); await sleep(200);
    let r2=await S(); ck('Python auto-reload started', r2.reloadT>0.5, r2);
    await sleep(3400);
    let r3=await S(); ck('Python reloaded to 6', r3.mag===6, r3);

    const pass = fails.length===0 && errors.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
