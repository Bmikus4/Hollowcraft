// ASSERTION: a shield exists, is craftable, reduces damage from either hand, wears out, and renders as a real 3D object
// in whichever hand holds it.
//
// Failing-test-first: ?noshield=1 makes shields stop blocking and stop rendering. With that flag the run must FAIL.
//
// Damage is driven through the real damage() choke point (__hc.hurt) rather than recomputed here, and the meshes are
// measured by counting triangles actually built into each hand's view group — an extruded 2D icon and a real board are
// both "a mesh", so the check is that the SHIELD builder ran, not merely that something is there.
//
// usage: node bench/assert-shield.mjs [flags]     e.g. noshield=1
//        exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const KILLED = /noshield/.test(FLAGS);

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const CASES = [];
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  CASES.push({name, got, want, ok});
  console.log('  '+(ok?'ok  ':'FAIL')+'  '+name.padEnd(48)+' got='+JSON.stringify(got)+(ok?'':'  want='+JSON.stringify(want)));
  return ok;
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false; const pageErrors=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    const hookErrors = e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); };
    page.on('pageerror', hookErrors);
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage(); page.on('pageerror', hookErrors);
    }
    await page.goto(base+'/index.html?debug=1&rd=6'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(3000);
    await page.evaluate('__hc.eqUI("inv")'); await sleep(300);
    await page.evaluate('__hc.eqClearInv()');
    await page.evaluate('__hc.eqUI("close")'); await sleep(200);
    console.log('kill switch '+(KILLED?'ON  (?noshield=1) — no blocking, no 3D shield':'off — feature live'));

    // ---------- 1. the item and its recipe exist ----------
    // These are NOT gated by the kill switch on purpose: ?noshield=1 disables blocking and rendering, it does not delete
    // the item. Reported separately so they can never be mistaken for kill-switch evidence.
    console.log('\n[1] item + recipe (ungated by the kill switch)');
    const S0 = await page.evaluate('__hc.shield()');
    const rec = await page.evaluate('__hc.canCraft("shield")');
    console.log('  item defined: '+S0.recipeItem+'   recipe: '+JSON.stringify(rec));
    if(!S0.recipeItem){ console.log('  FAIL no shield item'); fail=true; }
    if(!rec || rec.found!==true){ console.log('  FAIL no shield recipe'); fail=true; }
    else if(rec.out!=='shield:1'){ console.log('  FAIL recipe does not actually craft a shield (matcher said '+JSON.stringify(rec.out)+')'); fail=true; }

    // ---------- 2. baseline damage, nothing equipped ----------
    console.log('\n[2] mitigation through the real damage() path');
    await page.evaluate('__hc.shieldHold("none")');
    const bare = await page.evaluate('__hc.hurt(10)');
    console.log('  bare hit of 10 -> health '+bare+' (lost '+(20-bare).toFixed(3)+')');

    await page.evaluate('__hc.shieldHold("off")');
    const withOff = await page.evaluate('__hc.hurt(10)');
    check('shield in the OFFHAND reduces the hit', withOff > bare, true);

    await page.evaluate('__hc.shieldHold("none")');
    await page.evaluate('__hc.shieldHold("main")');
    const withMain = await page.evaluate('__hc.hurt(10)');
    check('shield in the MAIN hand reduces the hit', withMain > bare, true);

    // ---------- 3. durability ----------
    console.log('\n[3] it wears');
    await page.evaluate('__hc.shieldHold("none")');
    await page.evaluate('__hc.shieldHold("off")');
    const d0 = (await page.evaluate('__hc.shield()')).dur;
    await page.evaluate('__hc.hurt(2)'); await page.evaluate('__hc.hurt(2)');
    const d1 = (await page.evaluate('__hc.shield()')).dur;
    check('durability drops as it takes hits', (d0!=null && d1!=null && d1 < d0), true);

    // ---------- 4. it renders as a real object in each hand ----------
    // Identified by the builder's own tag, NOT by triangle count. Measured on this build: with ?noshield=1 the main hand
    // falls through to the generic extruded-icon path and produces 564 triangles against the real board's 312 — so a size
    // threshold reports the disabled shield as present. The tag is the only honest discriminator.
    console.log('\n[4] 3D object in both hands');
    await page.evaluate('__hc.shieldHold("none")'); await sleep(200);
    await page.evaluate('__hc.shieldHold("main")'); await sleep(400);
    const M = await page.evaluate('__hc.shield()');
    console.log('  main hand: view.id='+JSON.stringify(M.mainView)+' tris='+M.mainTris+' isShieldBoard='+M.mainIsShield);
    check('main-hand mesh is the shield board', M.mainIsShield, true);

    await page.evaluate('__hc.shieldHold("none")'); await sleep(200);
    await page.evaluate('__hc.shieldHold("off")'); await sleep(400);
    const O = await page.evaluate('__hc.shield()');
    console.log('  offhand:   offView.id='+JSON.stringify(O.offView)+' tris='+O.offTris+' isShieldBoard='+O.offIsShield);
    check('offhand mesh is the shield board', O.offIsShield, true);

    check('no page errors across the whole run', pageErrors.length, 0);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }

  const failed = CASES.filter(c=>!c.ok);
  console.log('\n'+CASES.length+' kill-switch-gated checks, '+failed.length+' failed');
  if(KILLED){
    if(failed.length===0){ console.log('ABORT: kill switch ON but every gated check passed — a check that cannot fail is not evidence.'); fail=true; }
    else { console.log('kill switch caught '+failed.length+' failures — the check can fail. Expected: '+failed.map(c=>c.name).join(', ')); }
  } else {
    fail = fail || failed.length>0;
  }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
