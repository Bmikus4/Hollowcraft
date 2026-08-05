// BACKROOMS RECON — three questions, one boot each for two flag states:
//  1) Does entering put the player ON TOP of the halls? (compare spawn Y to the entry chunk's own floor/ceiling)
//  2) Are there SOLID voxels in the open air between floor and ceiling — "invisible blocks filling the Backrooms"?
//  3) Does __hcBRX.reslab(8) make them vanish? (tests the stale-lid theory: brSlabColumn is additive and the real
//     generation path passes clear=false, so a column whose storey changed keeps its old lid at the old Y.)
// Run twice: default flags, then ?perfoff=all — separates a perf-pass regression from a pre-existing bug.
// usage: node bench/tmp-br-recon.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
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

// Scan a grid of columns around the player. For each, list every solid Y in 30..70, then classify:
//   floor  = the expected slab Y for that column's own storey
//   ceil   = floor + BR_CH
//   STRAY  = any solid strictly between floor and ceil, or ANY solid outside [0, floor]u[ceil] set
// Reported as counts + a handful of examples. Pure read; changes nothing.
const STRAY = `(()=>{ const B=__hcBRX, R=__hcBR; const P=__hc.pos(); const px=Math.floor(P.x), pz=Math.floor(P.z);
  const out={ cols:0, strayCols:0, strayBlocks:0, ex:[], spawnY:+P.y.toFixed(2) };
  for(let dx=-40; dx<=40; dx+=5) for(let dz=-40; dz<=40; dz+=5){
    const wx=px+dx, wz=pz+dz;
    let base=null; try{ const c=B.chunkOf? B.chunkOf(wx,wz) : null; base = c? B.baseY(c.gx,c.gz) : null; }catch(e){}
    if(base==null) continue;
    const ceil=base+9; const solids=[];
    for(let y=30;y<=70;y++){ let s=false; try{ s=!!window.__hcSolid(wx,y,wz); }catch(e){ s=false; }
      if(s) solids.push(y); }
    out.cols++;
    const stray = solids.filter(y=> y>base && y<ceil );
    if(stray.length){ out.strayCols++; out.strayBlocks+=stray.length;
      if(out.ex.length<8) out.ex.push({wx,wz,base,ceil,solids,stray}); }
  }
  return out; })()`;

const ENTRYINFO = `(()=>{ const B=__hcBRX; const P=__hc.pos(); const wx=Math.floor(P.x), wz=Math.floor(P.z);
  const c=B.chunkOf(wx,wz), base=B.baseY(c.gx,c.gz); const solids=[];
  for(let y=30;y<=70;y++){ let s=false; try{ s=!!window.__hcSolid(wx,y,wz); }catch(e){} if(s) solids.push(y); }
  return { playerY:+P.y.toFixed(2), chunk:[c.gx,c.gz], level:B.level(c.gx,c.gz), base, ceil:base+9,
           colSolids:solids, aboveCeiling: P.y > base+9,
           LEVELS:B.LEVELS }; })()`;

async function run(flags){
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const label = flags||'default';
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
    const url = base+'/index.html?debug=1'+(flags?('&'+flags):'');
    await page.goto(url, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, { timeout:90000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, { timeout:90000 });

    // expose solidAt through a stable global so the probe does not depend on it being in scope
    await page.evaluate(`window.__hcSolid = (x,y,z)=>{ try{ return __hc.blockAt? !!__hc.blockAt(x,y,z) : false; }catch(e){ return false; } };`);
    const hasBlockAt = await page.evaluate(`typeof __hc.blockAt==='function'`);
    console.log('['+label+'] blockAt available:', hasBlockAt);

    await page.evaluate(`__hcBR.enter()`);
    await sleep(6000);
    const entry = await page.evaluate(ENTRYINFO);
    console.log('['+label+'] ENTRY', JSON.stringify(entry));
    await page.screenshot({ path: path.join(OUT, 'br-'+label+'-spawn.png') });

    const before = await page.evaluate(STRAY);
    console.log('['+label+'] STRAY before', JSON.stringify({cols:before.cols, strayCols:before.strayCols, strayBlocks:before.strayBlocks}));
    if(before.ex.length) console.log('['+label+']   ex', JSON.stringify(before.ex.slice(0,4)));

    const audit = await page.evaluate(`(()=>{ try{ return __hcBRX.slabAudit(); }catch(e){ return {err:String(e.message)}; } })()`);
    console.log('['+label+'] slabAudit', JSON.stringify(audit).slice(0,500));

    const n = await page.evaluate(`__hcBRX.reslab(8)`);
    await sleep(3000);
    console.log('['+label+'] reslab re-laid chunks:', n);
    const after = await page.evaluate(STRAY);
    console.log('['+label+'] STRAY after ', JSON.stringify({cols:after.cols, strayCols:after.strayCols, strayBlocks:after.strayBlocks}));
    await page.screenshot({ path: path.join(OUT, 'br-'+label+'-after-reslab.png') });

    // SECOND VISIT through a FRESH DOOR — brSpawnDoor re-randomises BR.seed, so this is the case where the
    // already-generated voxel chunks were laid under the previous seed's storey assignment.
    await page.evaluate(`__hcBR.exit()`); await sleep(2500);
    await page.evaluate(`__hcBR.door()`); await sleep(500);
    await page.evaluate(`__hcBR.enter()`); await sleep(6000);
    const entry2 = await page.evaluate(ENTRYINFO);
    console.log('['+label+'] ENTRY#2', JSON.stringify(entry2));
    const stray2 = await page.evaluate(STRAY);
    console.log('['+label+'] STRAY#2 ', JSON.stringify({cols:stray2.cols, strayCols:stray2.strayCols, strayBlocks:stray2.strayBlocks}));
    if(stray2.ex.length) console.log('['+label+']   ex#2', JSON.stringify(stray2.ex.slice(0,4)));
    const audit2 = await page.evaluate(`(()=>{ try{ return __hcBRX.slabAudit(); }catch(e){ return {err:String(e.message)}; } })()`);
    console.log('['+label+'] slabAudit#2', JSON.stringify(audit2).slice(0,400));
    await page.screenshot({ path: path.join(OUT, 'br-'+label+'-visit2.png') });
    const n2 = await page.evaluate(`__hcBRX.reslab(8)`); await sleep(3000);
    const stray2b = await page.evaluate(STRAY);
    console.log('['+label+'] STRAY#2 after reslab('+n2+')', JSON.stringify({strayCols:stray2b.strayCols, strayBlocks:stray2b.strayBlocks}));
    fs.writeFileSync(path.join(OUT,'br-recon-'+label+'.json'), JSON.stringify({entry,before,audit,reslab:n,after,entry2,stray2,audit2,stray2b},null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
}

(async()=>{
  await run('');
  await run('perfoff=all');
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
