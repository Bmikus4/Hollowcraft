// ASSERT: the HUD is five bars in the bottom-left corner and a compass ribbon at the top, and the minimap is gone
// (Ben 08-11: "the health, food, water, stamina, and shield in the bottom left. No more minimap, the navigation bar in
// the top center which will rotate like a compass and give you your bearing").
//
// THE BEARING IS THE ONLY HARD CLAIM HERE. A bar's width is trivially checkable and a screenshot would do; a compass
// that turns the wrong way looks perfectly correct in any single frame and is useless in the hand. So the sweep below
// sets eight yaws and checks BOTH that the letter nearest the index is the one the player is facing AND that turning
// right moves the ribbon left — the sign that a mirrored conversion would get wrong while every label still looked fine.
//
// usage: node bench/assert-hud.mjs   -> bench/results/hud-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(46)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const ctx=await browser.newContext({ viewport:{width:1280,height:720} }); const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+(e&&e.stack||e)));
    await page.goto(base+'/index.html',{waitUntil:'load'});
    await sleep(3000);
    await page.click('#mb-solo');
    // Wait for the world, not for a clock: the HUD is hidden until the loading plate releases, so every reading before
    // that is a reading of a hidden panel.
    for(let i=0;i<90;i++){ if(await page.evaluate(()=>window.__hc.loadState().circleDone)) break; await sleep(500); }
    await sleep(2500);

    console.log('\n[the minimap is gone]');
    const mm=await page.evaluate(()=>({ el:!!document.getElementById('minimap'),
      fn:typeof window.updateMinimap, vit:!!document.getElementById('vitals'), cmp:!!document.getElementById('compass') }));
    ok('no #minimap element',   mm.el===false, mm.el);
    ok('vitals + compass exist', mm.vit && mm.cmp, mm);

    console.log('\n[five bars, bottom left]');
    const v=await page.evaluate(()=>window.__hc.hudVitals({health:20,hunger:20,water:20,stam:100}));
    ok('five rows',             Object.keys(v.rows).length===5, Object.keys(v.rows));
    ok('all five read full',    ['health','food','water','stam','armor'].every(k=>k==='armor'||v.rows[k].pct==='100.0%'), Object.fromEntries(Object.entries(v.rows).map(([k,r])=>[k,r.pct])));
    ok('panel is in the corner', v.panel.left<40 && v.panel.bottom<40, v.panel);
    ok('panel is narrow',       v.panel.w<300, v.panel.w);
    const half=await page.evaluate(()=>window.__hc.hudVitals({health:10,hunger:5,water:15,stam:50}));
    ok('bars follow the values', half.rows.health.pct==='50.0%' && half.rows.food.pct==='25.0%' && half.rows.water.pct==='75.0%',
      {hp:half.rows.health.pct, food:half.rows.food.pct, water:half.rows.water.pct});
    ok('stamina eased to target', Math.abs(parseFloat(half.rows.stam.pct)-50)<6, half.rows.stam.pct);
    ok('stamina is chromatic',  /^hsl\(/.test(half.rows.stam.col), half.rows.stam.col);
    await page.screenshot({path:path.join(OUT,'hud-vitals.png')});

    console.log('\n[the compass points where you look]');
    // yaw 0 faces north and yaw -90 faces east: the convention the minimap's own label placement used, kept so every
    // other bearing in the game still means the same thing.
    const SWEEP=[[0,'N'],[-45,'NE'],[-90,'E'],[-135,'SE'],[180,'S'],[135,'SW'],[90,'W'],[45,'NW']];
    for(const [yaw,want] of SWEEP){
      const c=await page.evaluate(y=>window.__hc.hudCompass(y), yaw);
      ok('yaw '+String(yaw).padStart(4)+' reads '+want, c.nearest.lab===want && c.nearest.off<0.01, {bearing:c.bearing, lab:c.nearest.lab, off:c.nearest.off}); }
    const centred=await page.evaluate(()=>window.__hc.hudCompass(0));
    ok('ribbon is centred',     centred.centred===true, centred.box);
    ok('ribbon is at the top',  centred.box.top<40, centred.box.top);
    // TURNING RIGHT MOVES THE RIBBON LEFT. In this engine turning right lowers yaw (east is -90), so north's offset
    // from the index must go negative. A mirrored conversion passes every label check above and fails this one.
    const drift=await page.evaluate(()=>{ const a=window.__hc.hudCompass(0).bearing, b=window.__hc.hudCompass(-20).bearing; return {a,b}; });
    ok('turning right raises the bearing', drift.b>drift.a && drift.b<90, drift);
    await page.screenshot({path:path.join(OUT,'hud-compass.png')});
    await page.evaluate(()=>window.__hc.hudCompass(-35));
    await sleep(300); await page.screenshot({path:path.join(OUT,'hud-full.png')});

    console.log('\n[the HUD switch still owns them]');
    await page.evaluate(()=>window.__hc.hud(false)); await sleep(200);
    const off=await page.evaluate(()=>['vitals','compass'].map(i=>getComputedStyle(document.getElementById(i)).display));
    ok('hide-HUD hides both',   off.every(d=>d==='none'), off);
    await page.evaluate(()=>window.__hc.hud(true)); await sleep(200);
    const on=await page.evaluate(()=>['vitals','compass'].map(i=>getComputedStyle(document.getElementById(i)).display));
    ok('and gives them back',   on.every(d=>d!=='none'), on);

    if(errs.length){ console.log('\n--- page errors ---'); for(const e of errs.slice(0,10)) console.log(e); }
    ok('no page errors', errs.length===0, errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\n'+(fails?'FAILED ':'PASSED ')+(checks-fails)+'/'+checks);
  process.exit(fails?1:0);
})();
