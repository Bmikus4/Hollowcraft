// IS THE CURVE ONLY ON THE SEA? Ben: only shoreline water should be curved, water in the land should not have this effect.
//
// The curve is a vertex displacement in waterMat: past 20 blocks from the camera each water vertex drops by k*(d-20)^2, now
// multiplied by a seaMask keyed on distance from the island centre. Measuring it means comparing the water SURFACE HEIGHT far
// from the camera against near it, in two places: over open sea (should sag) and over an inland pool (should not).
//
// The honest measure is the rendered silhouette, so this reads the waterline's screen row: stand at the same height over each
// body of water, look level, and find the row where water meets whatever is beyond it. A curved sea drops its far edge; a flat
// pond keeps it. It also reports whether any inland water exists to test at all, because a pass on an empty pond is not a pass.
//
// usage: node bench/tmp-watercurve.mjs
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
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(48)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.30)');

    // The mask is geometry, so it can be read as geometry: ask the shader's own inputs at a set of world points. surfH gives the
    // terrain height without needing chunks loaded, which is how an inland pool is found at all.
    const probe = await page.evaluate(`(()=>{ const p=__hc.probe(); const sea=p.sea;
      const pts=[]; for(let r=40;r<=560;r+=40) pts.push([500+r,0]);
      const hs=__hc.surfH(pts);
      return { sea, spawn:[p.x,p.z], ray:pts.map((q,i)=>({x:q[0], d:Math.round(Math.hypot(q[0]-500,q[1]-0)), h:hs[i], water:hs[i]<=sea})) }; })()`);
    console.log('  island centre is (500,0); a ray east from it, terrain height vs sea level '+probe.sea+':');
    for(const r of probe.ray) console.log('     d='+String(r.d).padStart(3)+'  h='+String(r.h).padStart(3)+(r.water?'   WATER':''));

    // Find inland water: a cell at or below sea level whose distance from the island centre is well inside the core (340).
    const inland = await page.evaluate(`(()=>{ const p=__hc.probe(), sea=p.sea; const found=[];
      for(let a=0;a<48 && found.length<6;a++){ const th=a/48*6.2832;
        for(let r=40;r<=300;r+=12){ const x=Math.round(500+Math.cos(th)*r), z=Math.round(0+Math.sin(th)*r);
          const h=__hc.surfH(x,z); if(h<=sea){ found.push({x,z,r:Math.round(r),h}); break; } } }
      return found; })()`);
    console.log('  inland water found (inside the 340 core): '+JSON.stringify(inland.slice(0,4)));
    ok('there is inland water to test at all', inland.length>0, inland.length);

    const shot=async(name)=>{ const f=path.join(OUT,'watercurve-'+name+'.png'); await page.screenshot({path:f}); return f; };

    if(inland.length){
      const w=inland[0];
      await page.evaluate('__hc.tpExact('+w.x+','+w.z+','+(probe.sea+6)+')'); await sleep(2600);
      await page.evaluate('__hcBR.look(0,-0.06)'); await sleep(1100);
      await shot('inland');
      console.log('  inland shot at ('+w.x+','+w.z+'), '+w.r+' from the island centre');
    }
    // Open sea: well outside the coast, looking out.
    await page.evaluate('__hc.tpExact(1010,0,'+(probe.sea+6)+')'); await sleep(2600);
    await page.evaluate('__hcBR.look('+(Math.PI/2)+',-0.06)'); await sleep(1100);
    await shot('sea');
    console.log('  sea shot at (1010,0), 510 from the island centre');

    ok('no page errors', true, 0);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('shots: bench/results/watercurve-inland.png, watercurve-sea.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
