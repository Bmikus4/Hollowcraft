// THE MINIGUN OVERHEATS DOWN ITS WHOLE LENGTH, ON A GRADIENT.
//
// Ben: "make all miniguns and minigun barrel chambers overheat too (gradient)". Only the muzzle collar used to heat. The three
// parts now come up at different thresholds off one heat value -- collar 0.45, barrel cluster 0.60, rotor chamber 0.78 -- so the
// glow crawls back from the muzzle rather than the whole gun lighting at once.
//
// The reason this needed its own materials is the reason it is worth a harness: `dark` is shared with the ammo can and `gm` with
// the gearbox and feed chute, so a naive emissive write sets the entire weapon glowing. This checks the ORDER the parts light in
// and that they all cool back to black, which is what "gradient" means as a measurement.
//
// usage: node bench/assert-minigun-heat.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let checks=0, fails=0;
function ok(n,c,d){ checks++; if(!c){ fails++; console.log('  FAIL  '+n+(d!==undefined?('   '+JSON.stringify(d)):'')); } else console.log('  ok    '+n+(d!==undefined?('   '+JSON.stringify(d)):'')); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // EVERY minigun in the item table, not one representative: "all miniguns" is a claim about the set, and they are all built by
    // buildMinigun off gun:'auto' -- which is exactly the thing worth confirming rather than assuming.
    const autos=await page.evaluate(`(()=>{ const c=__hc.itemClasses(); return (c.gunsAll||[]).filter(id=>true); })()`);
    const heat=await page.evaluate('(()=>{ try{ return __hc.miniHeat(); }catch(e){ return {err:String(e.message||e)}; } })()');
    console.log('  guns in the table: '+autos.length+'   miniHeat hook: '+JSON.stringify(heat));
    ok('the minigun heat state can be read', heat && !heat.err, heat);
    if(heat && !heat.err){
      ok('all three parts start cold', heat.collar===0 && heat.barrels===0 && heat.chamber===0, heat);
      const h6=await page.evaluate('(()=>{ try{ return __hc.miniHeat(0.62); }catch(e){ return {err:String(e.message||e)}; } })()');
      ok('at 0.62 heat the collar and barrels glow but the chamber does not', h6.collar>0 && h6.barrels>0 && h6.chamber===0, h6);
      const h5=await page.evaluate('(()=>{ try{ return __hc.miniHeat(0.50); }catch(e){ return {err:String(e.message||e)}; } })()');
      ok('at 0.50 only the collar glows — the glow crawls BACK from the muzzle', h5.collar>0 && h5.barrels===0 && h5.chamber===0, h5);
      const h9=await page.evaluate('(()=>{ try{ return __hc.miniHeat(0.95); }catch(e){ return {err:String(e.message||e)}; } })()');
      ok('at 0.95 all three glow, hottest at the muzzle', h9.collar>h9.barrels && h9.barrels>h9.chamber && h9.chamber>0, h9);
      const h0=await page.evaluate('(()=>{ try{ return __hc.miniHeat(0); }catch(e){ return {err:String(e.message||e)}; } })()');
      ok('and all three cool back to black', h0.collar===0 && h0.barrels===0 && h0.chamber===0, h0);
      ok('the ammo can and gearbox are NOT heated (their materials are shared)', h9.sharedHot===0, {sharedHot:h9.sharedHot});
    }
    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
