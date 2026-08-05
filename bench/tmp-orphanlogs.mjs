// ORPHANED TRUNK SEGMENTS around a village — Ben's screenshot of logs scattered through a lit settlement.
// A log with AIR directly beneath it is a floating trunk fragment. This counts them, and reports what sits
// under each run, which separates "trunk cut by a build pad" from "tree planted on top of a finished building".
// __hc.qaVillage() force-builds a village near the player, so the site is known and the run is repeatable.
// usage: node bench/tmp-orphanlogs.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
const TAG = process.argv[2] || 'orphan';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const SCAN = (cx,cz,R) => `(()=>{
  const LOG=__hc.bid('log'), LEAF=__hc.bid('leaves'), CORE=__hc.bid('leaves_core');
  const names={}; for(const k of __hc.bid()) names[__hc.bid(k)]=k;
  const B=(x,y,z)=>__hc.blockAt(x,y,z)|0;
  const out={ LOG, loadedCols:0, orphanRuns:0, orphanBlocks:0, insideBuilding:0, ex:[], underTally:{} };
  for(let x=${cx}-${R}; x<=${cx}+${R}; x++) for(let z=${cz}-${R}; z<=${cz}+${R}; z++){
    const g=__hc.surfH(x,z);
    let any=false; for(let y=g-3; y<=g+44; y++) if(B(x,y,z)){ any=true; break; }
    if(!any) continue;
    out.loadedCols++;
    let y=g-3;
    while(y<=g+44){
      if(B(x,y,z)===LOG && B(x,y-1,z)===0){
        let n=0, yy=y; while(yy<=g+46 && B(x,yy,z)===LOG){ n++; yy++; }
        out.orphanRuns++; out.orphanBlocks+=n;
        // what is the nearest solid thing below the gap? that tells us WHY the trunk lost its base
        let under=0, depth=0; for(let k=y-1; k>=g-4; k--){ depth++; if(B(x,k,z)){ under=B(x,k,z); break; } }
        const un=names[under]||('id'+under);
        out.underTally[un]=(out.underTally[un]||0)+1;
        if(/planks|thatch|log_wall|stone|cobble/.test(un)) out.insideBuilding++;
        if(out.ex.length<10) out.ex.push({x,z,yBottom:y,run:n,ground:g,under:un,gap:depth});
        y=yy; continue;
      }
      y++;
    }
  }
  return out; })()`;

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    let browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    let page = await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const glProbe = `(()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return 'NO';const e=gl.getExtension('WEBGL_debug_renderer_info');return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(glProbe))){
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&t=252&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, { timeout:90000 });

    const v = await page.evaluate(`__hc.qaVillage()`);
    console.log('qaVillage', JSON.stringify(v).slice(0,400));
    await sleep(4000);
    const P = await page.evaluate(`__hc.pos()`);
    const cx = Math.round(P.x), cz = Math.round(P.z);

    // PASS 1 — right after the build
    const a = await page.evaluate(SCAN(cx,cz,24));
    console.log('after build   :', JSON.stringify({loadedCols:a.loadedCols, orphanRuns:a.orphanRuns, orphanBlocks:a.orphanBlocks, insideBuilding:a.insideBuilding, under:a.underTally}));
    if(a.ex.length) console.log('   ex', JSON.stringify(a.ex.slice(0,6)));

    // PASS 2 — walk away and back so the surrounding chunks unload/regenerate. Chunks that generate AFTER the
    // village exists run decorate() again, and the village is NOT in _NOTREE, so pineEmit is free to plant into it.
    await page.evaluate(`__hc.tp(${cx+900}, ${cz+900})`); await sleep(7000);
    await page.evaluate(`__hc.tp(${cx}, ${cz})`); await sleep(9000);
    const b = await page.evaluate(SCAN(cx,cz,24));
    console.log('after revisit :', JSON.stringify({loadedCols:b.loadedCols, orphanRuns:b.orphanRuns, orphanBlocks:b.orphanBlocks, insideBuilding:b.insideBuilding, under:b.underTally}));
    if(b.ex.length) console.log('   ex', JSON.stringify(b.ex.slice(0,6)));

    // CONTROL: pristine forest, far from every structure. If broken trunks appear here too, buildings are not the
    // cause at all and this is a tree-generation bug — which is what the 'under: {log: 55}' tally already suggests,
    // since every orphaned run was sitting on more trunk rather than on masonry.
    await page.evaluate(`__hc.tp(${cx+1400}, ${cz-1100})`); await sleep(10000);
    const Pc = await page.evaluate(`__hc.pos()`);
    const wx = Math.round(Pc.x), wz = Math.round(Pc.z);
    const c0 = await page.evaluate(SCAN(wx,wz,24));
    console.log('pristine wood :', JSON.stringify({at:[wx,wz], loadedCols:c0.loadedCols, orphanRuns:c0.orphanRuns, orphanBlocks:c0.orphanBlocks, insideBuilding:c0.insideBuilding, under:c0.underTally}));
    if(c0.ex.length) console.log('   ex', JSON.stringify(c0.ex.slice(0,6)));

    fs.writeFileSync(path.join(OUT, TAG+'.json'), JSON.stringify({afterBuild:a, afterRevisit:b, pristine:c0},null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
