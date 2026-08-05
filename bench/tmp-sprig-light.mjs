// Ben 08-05: "the lighting on trees does not look right any more, the lighting on the foliage on the outside of trees
// especially". The claim under test is a NUMBER, not a look: a sprig took the leaf CELL's own _ssky, which is a top-down
// column heightfield, so the fringe on the side of a canopy was stamped as buried while the leaf face behind it took
// _sskyOpen of the air cell and was stamped as open. If that is the bug, the mean aSky of the sprig verts sits well
// BELOW the mean aSky of the leaf faces in the same chunks, and the fix closes the gap.
// Two pages, since the sprig's sky is baked at mesh time: the newest commit WITHOUT the marker, and the working tree.
// node bench/tmp-sprig-light.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
const OLD=path.join(ROOT,'_spriglight_old.html');
const MARK='A SPRIG IS LIT LIKE THE AIR IT GROWS INTO';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// mean aSky over SPRIG verts (aTile is one of the three sprig tiles) against mean aSky over the leaf meshes of the same
// chunks. Grass and kelp share the foliage mesh, so the tile filter is what makes this a measurement of the canopy.
const STATS=`(function(){
  const T=__hc.canopyProbe().sprigTiles, want=new Set([T.pine,T.birch,T.oak]);
  let sN=0,sSum=0,sLo=0, lN=0,lSum=0,lLo=0;
  __hc.foliageMeshes().forEach(m=>{ const a=m.geometry.attributes; if(!a.aTile||!a.aSky) return;
    for(let i=0;i<a.aTile.count;i++){ if(!want.has(a.aTile.array[i])) continue;
      const v=a.aSky.array[i]; sN++; sSum+=v; if(v<0.2) sLo++; } });
  __hc.leafMeshes().forEach(m=>{ const a=m.geometry.attributes; if(!a.aSky) return;
    for(let i=0;i<a.aSky.count;i++){ const v=a.aSky.array[i]; lN++; lSum+=v; if(v<0.2) lLo++; } });
  return { sprigVerts:sN, sprigSky:sN?+(sSum/sN).toFixed(3):null, sprigDarkShare:sN?+(sLo/sN).toFixed(3):null,
           leafVerts:lN, leafSky:lN?+(lSum/lN).toFixed(3):null, leafDarkShare:lN?+(lLo/lN).toFixed(3):null }; })`;

(async()=>{
  // THE BASELINE IS THE WORKING FILE WITH ONE LINE PUT BACK, not an older commit: this harness reads aSky through
  // __hc.foliageMeshes(), which no commit before the fix has, so a git baseline dies on the first evaluate.
  const cur=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const FIXED='const fsky = clamp(oy!==0 ? _ssky(lx+ox,ly+oy,lz+oz) : _sskyOpen(lx+ox,ly+oy,lz+oz), 0, 1);';
  if(!cur.includes(FIXED)) throw new Error('the fixed line is not in index.html — nothing to revert against');
  fs.writeFileSync(OLD, cur.replace(FIXED, 'const fsky = clamp(_ssky(lx,ly,lz),0,1);   // OLD: the leaf cell\'s own column'));
  console.log('baseline = working tree with the sprig sky taken from the leaf cell again');
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  const run=async(file,tag)=>{
    const page=await (await browser.newContext({viewport:{width:1000,height:560}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot=await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    await page.evaluate('__hc.tpAt('+(spot.x+20)+','+(spot.h+12)+','+(spot.z+20)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+10)+','+spot.z+')');
    await sleep(1500); await page.evaluate('__hc.setTime(0.25)'); await sleep(400);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    await page.screenshot({ path:path.join(ROOT,'bench','results','sprig-light-'+tag+'.png') });
    const st=await page.evaluate(STATS+'()');
    const fpsS=[]; for(let i=0;i<10;i++){ await sleep(400); await page.evaluate('__hc.setTime(0.25)'); fpsS.push((await page.evaluate('__hc.st()')).fps); }
    fpsS.sort((a,b)=>a-b);
    await page.context().close();
    return { spot, st, fps:fpsS[fpsS.length>>1] };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const o=await run('_spriglight_old.html','old');
    const n=await run('index.html','new');
    console.log('OLD ' + JSON.stringify(o.st) + '  fps ' + o.fps);
    console.log('NEW ' + JSON.stringify(n.st) + '  fps ' + n.fps);
    console.log('  mean sprig sky   ' + o.st.sprigSky + ' -> ' + n.st.sprigSky + '   (leaf faces in the same chunks: ' + o.st.leafSky + ' -> ' + n.st.leafSky + ')');
    console.log('  sprig verts stamped near-dark (sky<0.2)  ' + (100*o.st.sprigDarkShare).toFixed(1) + '% -> ' + (100*n.st.sprigDarkShare).toFixed(1) + '%');
    console.log('  frames bench/results/sprig-light-old.png  sprig-light-new.png');
  } finally { await browser.close(); server.kill(); try{ fs.unlinkSync(OLD); }catch(e){} }
})();
