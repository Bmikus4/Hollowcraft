// Ben 08-05: "there are some overlaps corner to corner leaves foliage, making two planes intersect and giving a weird
// look" + "just make inside oak leaves NOT have foliage". Both are properties of the sprig pass, which runs at mesh
// time, so the baseline is the COMMITTED file served alongside the working one: git show HEAD:index.html.
// Reports, for each page: the sprig vertex count against the exposed leaf faces (the interior gate and the per-cell
// axis rule can only take verts away), and a frame of the same tree from the same vantage so the X can be looked at.
// node bench/tmp-sprig-corner.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OLD  = path.join(ROOT, '_sprigab_old.html');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async()=>{
  // HEAD IS NOT A BASELINE. Four sessions share this file and commit it whole, so my own uncommitted work is normally
  // already in HEAD under someone else's subject — the first run of this harness measured my build against itself and
  // reported a 0.0% change. The baseline is the newest commit whose index.html does NOT contain the marker comment of
  // the change under test.
  const MARK = 'NO TWO PERPENDICULAR SPRIGS ON ONE CELL';
  const refs = execSync('git log --format=%H -40', {cwd:ROOT}).toString().trim().split('\n');
  let base=null;
  for(const r of refs){ const src=execSync('git show '+r+':index.html', {cwd:ROOT, maxBuffer:64*1024*1024}).toString();
    if(!src.includes(MARK)){ base=r; fs.writeFileSync(OLD, src); break; } }
  if(!base) throw new Error('no commit in the last 40 without the marker');
  console.log('baseline ' + base.slice(0,7) + '  ' + execSync('git log -1 --format=%s '+base, {cwd:ROOT}).toString().trim());
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  const run = async (file, tag)=>{
    const page = await (await browser.newContext({ viewport:{width:1000,height:560} })).newPage();
    page.on('pageerror', e=>console.log('  PAGEERROR:', String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot = await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    // OUTSIDE the tree, level with the middle of the canopy: the vantage the X was seen from.
    // OUTSIDE THE TREE AND FAR ENOUGH BACK TO SEE ITS OUTLINE. The first version stood 11 blocks off, which put the
    // camera inside the canopy against the trunk: two leaf faces filled the frame and neither the sprigs nor the X were
    // in it. A sprig is judged on a SILHOUETTE against the sky.
    await page.evaluate('__hc.tpAt('+(spot.x+22)+','+(spot.h+13)+','+(spot.z+22)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.setTime(0.25)');
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+10)+','+spot.z+')');
    await sleep(1500);
    await page.evaluate('__hc.setTime(0.25)');
    await sleep(500);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    await page.screenshot({ path: path.join(ROOT,'bench','results','sprig-corner-'+tag+'.png') });
    const cp = await page.evaluate('(()=>{ const c=__hc.canopyProbe(); return {chunks:c.chunks, foliageVerts:c.foliageVerts, exposedFaces:c.exposedFaces, vertsPerFace:c.vertsPerFace}; })()');
    const fps = await (async()=>{ const s=[]; for(let i=0;i<10;i++){ await sleep(400); await page.evaluate('__hc.setTime(0.25)'); s.push((await page.evaluate('__hc.st()')).fps); } s.sort((a,b)=>a-b); return s[s.length>>1]; })();
    await page.context().close();
    return { spot, cp, fps };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const oldR = await run('_sprigab_old.html','old');
    const newR = await run('index.html','new');
    console.log('OLD (HEAD)  ' + JSON.stringify(oldR));
    console.log('NEW (tree)  ' + JSON.stringify(newR));
    console.log('  sprig verts per exposed face  ' + oldR.cp.vertsPerFace + ' -> ' + newR.cp.vertsPerFace);
    console.log('  sprig verts                   ' + oldR.cp.foliageVerts + ' -> ' + newR.cp.foliageVerts +
                '  (' + (100*(newR.cp.foliageVerts/Math.max(1,oldR.cp.foliageVerts)-1)).toFixed(1) + '%)');
    console.log('  median fps                    ' + oldR.fps + ' -> ' + newR.fps + '   (NEW also carries the leaf-layer + DoubleSide change)');
    console.log('  frames  bench/results/sprig-corner-old.png  sprig-corner-new.png');
  } finally { await browser.close(); server.kill(); try{ fs.unlinkSync(OLD); }catch(e){} }
})();
