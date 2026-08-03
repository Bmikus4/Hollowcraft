// ASSERT: the cabin near spawn is BUILT and STANDING. Backlog item "cabin not loading" (Ben 07-27). A fix for it landed
// at index.html:3217 -- an edit arriving mid-staged-build left blocks in c.blocks that never render -- but the item was
// never measured afterwards, and this list has a history of entries closed by a wrong measurement.
//
// Two independent questions, because either one alone can lie:
//   1. Are the BLOCKS there? Read the voxels in the cabin's own footprint through blockAt.
//   2. Are they DRAWN? The whole point of the 3217 bug is blocks that exist and never mesh, so voxels alone prove
//      nothing. The frame is the second answer.
//
// usage: node bench/assert-cabin.mjs   -> bench/results/cabin-assert-*.png
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
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    }
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');

    // The cabin is at a fixed seeded offset from spawn: buildCabin uses cx=spawnX+22, cz=spawnZ-14.
    const S = await page.evaluate('(()=>{const p=__hc.probe(); return {sx:p.spawnX, sz:p.spawnZ, x:p.x, z:p.z};})()');
    console.log('  spawn/state: '+JSON.stringify(S));
    if(S.sx==null) throw new Error('probe() has no spawnX — cannot locate the cabin, and guessing a location is how this check lied the first time');
    const cx = S.sx+22, cz = S.sz-14;
    console.log('  cabin at ('+cx+','+cz+')');

    // Stand outside the front (the door faces +z) and look at it, so the walls fill the frame.
    await page.evaluate('__hc.tp('+cx+','+(cz+11)+')'); await sleep(3500);
    await page.evaluate('__hc.look('+Math.PI+',-0.05)'); await sleep(1500);

    // 1. THE BLOCKS. Sweep the footprint and count non-air; the walls are logs/planks, so a standing cabin is hundreds.
    const B = await page.evaluate(`(()=>{ const cx=${cx}, cz=${cz};
      let gy=null; for(let y=90;y>2;y--){ if(__hc.blockAt(cx,y,cz)){ gy=y; break; } }
      let solid=0, wood=0, glass=0, air=0; const seen={};
      for(let x=cx-6;x<=cx+6;x++) for(let z=cz-8;z<=cz+8;z++) for(let y=gy;y<=gy+8;y++){
        const b=__hc.blockAt(x,y,z); if(!b){ air++; continue; } solid++; seen[b]=(seen[b]||0)+1; }
      return {gy, solid, air, kinds:Object.keys(seen).length, top:Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,6)}; })()`);
    console.log('  footprint: '+JSON.stringify(B));
    ok('the cabin has a ground level', B && B.gy>1, B&&B.gy);
    ok('hundreds of blocks stand in its footprint', B && B.solid>250, B&&B.solid);
    ok('built of several block kinds, not one slab', B && B.kinds>=4, B&&B.kinds);

    // 2. DRAWN. Blocks that exist and never mesh is the exact bug this item was about, so count how much of the frame is
    // NOT sky or grass -- a cabin filling the view moves that a long way from an empty clearing.
    const shot=path.join(OUT,'cabin-assert-front.png');
    await page.screenshot({path:shot});
    const img=decodePNG(fs.readFileSync(shot));
    let wooden=0, tot=0;
    for(let y=Math.floor(img.h*0.30); y<Math.floor(img.h*0.88); y++) for(let x=Math.floor(img.w*0.22); x<Math.floor(img.w*0.78); x++){
      const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; tot++;
      // plank/log browns: red dominant, blue clearly lowest, and not the near-black of deep shadow
      if(r>60 && r>g*1.12 && g>b*1.02 && r<230) wooden++; }
    const pct = 100*wooden/tot;
    console.log('  wood-toned pixels in the centre band: '+wooden+' / '+tot+' = '+pct.toFixed(1)+'%');
    ok('the cabin is DRAWN, not just present in blocks', pct>12, +pct.toFixed(1));

    await page.evaluate('__hc.tp('+(cx+9)+','+(cz+10)+')'); await sleep(2500);
    await page.evaluate('__hc.look('+(Math.PI*0.78)+',-0.08)'); await sleep(1200);
    await page.screenshot({path:path.join(OUT,'cabin-assert-corner.png')});

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    console.log('shots: bench/results/cabin-assert-front.png, cabin-assert-corner.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
