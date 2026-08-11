// THE 08-11 TEXTURE AND CLOTH PASS, measured. Ben's requests, in his words:
//   "the side of roof tiles should be textured the same as ... the block below them, if there is no block below them, then
//    pine logs", "make jesus and monks robes more flowy, and texture them", "texture teapots and teacups and thier plate",
//   "texture rockingchairs", "make thicker and texture campfire logs. you can add stones around them by placing pebbles in
//    them", "texture sulfur piles and pebble piles".
//
// EVERY ONE OF THESE IS A CLAIM ABOUT A MATERIAL OR A GEOMETRY, so none of them is a screenshot question. A 16px tile on a
// prop 40px tall in a bench frame cannot tell planks from bark, and "is the robe flowy" cannot be read off a still at all.
// So the harness asks the scene graph: which texture each material carries (tileTex/clothTex/chinaTex stamp their own key
// onto texture.name for exactly this), and for the robes, the fold depth and hem wave measured off the vertex buffer.
//
// The roof case is the one with real logic behind it, so it is tested BOTH ways in the same world: a roof standing on sand
// must wear sand on its gables, and a roof standing on nothing must fall back to log_side. One case passing proves nothing —
// a hardcoded 'log_side' would satisfy the floating one on its own.
//
// usage: node bench/assert-textures-0811.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    // WAIT FOR THE LOADING SCREEN TO GO, not just for `started`. The first attempt at this bench waited on
    // probe().chunkHere, which is true as soon as the chunk EXISTS in `world` — and found chunkRoot with zero children,
    // because nothing has been meshed into the scene yet while the summoning circle is still up. Every check failed for
    // that reason alone and not one of them was about the code under test.
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await sleep(4000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // ---- lay every prop out on the ground in front of the player, one cell apart so nothing merges ----
    const laid=await page.evaluate(`(()=>{
      const p=__hc.pos(), x0=Math.floor(p.x)+3, z0=Math.floor(p.z)+3, gy=Math.floor(__hc.groundY(x0+0.5,z0+0.5));
      const put=(dx,dz,name)=>__hc.setBlockAt(x0+dx,gy,z0+dz,name);
      const r={ y:gy, x0, z0 };
      r.teapot=put(0,0,'teapot'); r.teacup=put(2,0,'teacup'); r.chair=put(4,0,'rocking_chair');
      r.pebbles=put(0,2,'pebbles'); r.sulfur=put(2,2,'sulfur_ore'); r.campfire=put(4,2,'campfire');
      // ROOF ON SAND: the gable must take the block BELOW, so the sand goes down first and the roof on top of it.
      r.sand=__hc.setBlockAt(x0+0,gy,z0+4,'sand'); r.roofOnSand=__hc.setBlockAt(x0+0,gy+1,z0+4,'roof_n');
      // ROOF ON NOTHING: two clear cells under it, so the fallback is the only thing that can texture it.
      r.roofFloating=__hc.setBlockAt(x0+3,gy+3,z0+4,'roof_s');
      return r; })()`);
    console.log('  laid  '+JSON.stringify(laid));
    await sleep(2500);

    const mats=await page.evaluate('__hc.placedMats(null,true)');
    const parts=mats.parts||[];
    console.log('  mats  err='+JSON.stringify(mats.err||null)+' n='+parts.length+' seen='+mats.seen+' meshes='+mats.meshes);
    console.log('  sample '+JSON.stringify(parts.slice(0,8)));
    const named=parts.filter(p=>p.mapName).map(p=>p.col+' '+p.mapName+' v'+p.verts);
    const hasMap=(name)=>parts.some(p=>p.mapName===name);
    const withCol=(col)=>parts.filter(p=>p.col==='#'+col);                 // placedMats reports colours with the # on
    const pair=(col,name)=>parts.some(p=>p.col==='#'+col && p.mapName===name);

    // ROOF GABLES. The gable geometry is the two triangles = 6 vertices, which is what separates it from the wedge body.
    const gables=parts.filter(p=>p.verts===6);
    ok('roof gable on sand wears sand',      gables.some(p=>p.mapName==='sand|1|1'),      gables.map(p=>p.mapName));
    ok('roof gable on nothing wears log',    gables.some(p=>p.mapName==='log_side|1|1'),  gables.map(p=>p.mapName));
    ok('two distinct gable textures',        new Set(gables.map(p=>p.mapName)).size>=2,   {n:gables.length});

    // THE TEA SET. Two china variants, because the saucer's pattern is drawn for a disc UV and the pot's for a lathe.
    ok('teapot glazed',   hasMap('china:pot'),   withCol('cdd2d8').map(p=>p.mapName));
    ok('teacup glazed',   hasMap('china:cup'),   withCol('e8e2d4').map(p=>p.mapName));
    ok('saucer glazed',   hasMap('china:plate'), withCol('e8e2d4').map(p=>p.mapName));

    ok('rocking chair textured', pair('b59f8d','planks|1|1'),     withCol('b59f8d').map(p=>p.mapName));
    ok('pebble pile textured',   pair('c1c2c6','cobble|1|1'),     withCol('c1c2c6').map(p=>p.mapName));
    ok('sulfur pile textured',   pair('ded9a0','sulfur_ore|1|1'), withCol('ded9a0').map(p=>p.mapName));
    // CAMPFIRE. ry=2 in the key is the proof the bark repeats along the log rather than stretching over it, and the ring is
    // its own cobble material at the stone tint — the fire and the pebble prop are meant to be the same stone.
    ok('campfire logs barked',      pair('7a6350','log_side|2|1'), withCol('7a6350').map(p=>p.mapName));
    ok('campfire has a stone ring', pair('c1c2c7','cobble|1|1'),   withCol('c1c2c7').map(p=>p.mapName));

    // ---- THE ROBES ----
    await page.evaluate('__hc.cmdRun("/spawn monk")').catch(()=>{});
    await page.evaluate('__hc.cmdRun("/spawn jesus")').catch(()=>{});
    await sleep(1500);
    const rp=await page.evaluate('__hc.robeProbe()');
    console.log('  robes '+JSON.stringify(rp));
    const monk=(rp.robes||[]).find(r=>r.type==='monk'), jes=(rp.robes||[]).find(r=>r.type==='jesus');
    for(const [who,r] of [['monk',monk],['jesus',jes]]){
      ok(who+' robe exists', !!r && !r.err, r||null);
      if(!r||r.err) continue;
      // FOLDS: on a CylinderGeometry every vertex of the hem ring sits at one radius, so foldDepth is exactly 0. Anything
      // above a tenth of the hem radius is cloth. Same for the hem: a lathe's hem is dead level, so hemWave is 0.
      ok(who+' hem has folds',  r.foldDepth > r.rHi*0.10, {foldDepth:r.foldDepth, rHi:r.rHi});
      ok(who+' hem is uneven',  r.hemWave > 0.01,         {hemWave:r.hemWave});
      ok(who+' cloth textured', (r.maps||[]).some(m=>m && m.indexOf('cloth:')===0), r.maps);
    }
    // SWAY: the cloth has to be MOVING, and it has to move by different amounts at different times — a constant offset
    // would pass a single-sample test while looking exactly as stiff as it did before.
    const s1=await page.evaluate('__hc.robeProbe()'); await sleep(700);
    const s2=await page.evaluate('__hc.robeProbe()');
    const moved=(s1.robes||[]).some((r,i)=>{ const q=(s2.robes||[])[i]; return q && r.sway && q.sway && r.sway.some((v,k)=>Math.abs(v-q.sway[k])>0.002); });
    ok('robes sway over time', moved, {a:(s1.robes||[]).map(r=>r.sway), b:(s2.robes||[]).map(r=>r.sway)});

    console.log('  maps  '+JSON.stringify(named));
    await page.screenshot({path:path.join(OUT,'textures-0811.png')});
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  if(errs.length) console.log('  page errors: '+JSON.stringify(errs.slice(0,5)));
  console.log((fails?'FAIL ':'PASS ')+(checks-fails)+'/'+checks+' checks'+(errs.length?' ('+errs.length+' page errors)':''));
  process.exit(fails||errs.length?1:0);
})();
