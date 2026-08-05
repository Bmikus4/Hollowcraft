// #68 — THE CANOPY. Nothing pinned any of this: assert-foliage-* measure plants standing on the ground, and the
// leaves are a different material, a different pass and a different generator. Every number here has already been
// wrong once today.
//
//   1 the leaf tiles are actually TRANSPARENT as painted into the atlas — not as intended, as sampled
//   2 the core is NOT (it is the opaque block behind the shell, and that is what makes the cutout affordable)
//   3 the material alpha-tests, and is not in the sorted blend pass
//   4 occludesSky is 0 for all six leaf ids — the item's one hard requirement, and the woods go black at noon without it
//   5 every exposed leaf face carries sprig geometry, and the three species use three different sprig tiles
// usage: node bench/assert-canopy.mjs
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
let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.30)');
    // Stand in the woods so there are real canopies meshed to count.
    const spot = await page.evaluate(`(()=>{ const P=__hc.probe(), px=Math.round(P.x), pz=Math.round(P.z);
      for(let r=16;r<160;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927, x=px+Math.round(Math.sin(th)*r), z=pz+Math.round(Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h}; } return null; })()`);
    if(spot) await page.evaluate('__hc.tp('+spot.x+','+spot.z+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:120000}).catch(()=>{});
    await sleep(5000);

    const p = await page.evaluate('__hc.canopyProbe()');
    console.log('  probe ' + JSON.stringify(p));
    if(p.err){ chk(false,'the probe ran', p.err); }
    else{
      console.log('\n--- 1  the cut leaves are transparent, as sampled from the atlas ---');
      // A FLOOR AND A CEILING, because both ends have been wrong in one day: 12% open was Ben's "they arent
      // transparent", and 79% open is a wire mesh that only looked right because the shell is three deep.
      const band=(v)=>v>0.30 && v<0.65;
      chk(band(p.alpha.leaves), 'pine leaves are open, and still leaves', (p.alpha.leaves*100).toFixed(0)+'% of the tile is clear');
      chk(band(p.alpha.birch), 'birch leaves are open, and still leaves', (p.alpha.birch*100).toFixed(0)+'%');
      chk(band(p.alpha.oak), 'oak leaves are open, and still leaves', (p.alpha.oak*100).toFixed(0)+'%');
      chk(p.alpha.sprig>0.40, 'and a sprig is mostly air', (p.alpha.sprig*100).toFixed(0)+'% clear');

      console.log('\n--- 2  the core is solid, which is what makes the shell affordable ---');
      chk(p.alpha.core===0, 'the core tile has no holes at all', (p.alpha.core*100).toFixed(0)+'%');

      console.log('\n--- 3  it is a cutout, not a blend ---');
      chk(p.alphaTest>0.1, 'the leaf material alpha-tests', 'alphaTest '+p.alphaTest);

      console.log('\n--- 4  no leaf occludes sky (the item\'s hard requirement) ---');
      const sky=p.sky, bad=Object.keys(sky).filter(k=>sky[k]!==0);
      chk(bad.length===0, 'all six leaf ids pass skylight', bad.length?('OCCLUDING: '+bad.join(',')):JSON.stringify(sky));

      console.log('\n--- 5  a sprig on every exposed face, and one tile per species ---');
      chk(p.chunks>0 && p.exposedFaces>200, 'there are canopies loaded to measure', p.chunks+' chunks, '+p.exposedFaces+' exposed faces');
      // Five quads on half the faces and three on the other half is 24 verts a face on average; the foliage mesh also
      // carries grass and kelp, so this is a floor, not an equality.
      chk(p.vertsPerFace>12, 'every exposed face is carrying sprig geometry', p.vertsPerFace+' foliage verts per exposed leaf face');
      const t=p.sprigTiles;
      chk(t.pine!=null && t.birch!=null && t.oak!=null && t.pine!==t.birch && t.birch!==t.oak && t.pine!==t.oak,
        'the three species have three different sprig tiles', JSON.stringify(t));
    }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
