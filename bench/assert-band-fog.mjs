// THE WOODY BAND UNDER THE HORIZON PINES ANSWERS TO ALL THREE FOG SYSTEMS.
//
// Ben reported this band ignoring the fog TWICE. The first fix routed only the weather bank (uWx) into its mix and was called
// done; the atmospheric haze path stayed hard-coded at 0.26 of what the canopy directly above it breathes, with a 0.42 ceiling,
// so the report came back verbatim as "the bottom of skybox pines are NOT affected by volumetric fog still". This file exists so
// a third report is not needed: it pins the band's exposure to the canopy's own expression and checks every fog system that can
// reach it -- distance haze, the weather bank, the volumetric density (underwater is that pass turned up to 0.34) -- by day and
// by night, plus the Backrooms, where this layer must draw nothing at all.
//
// The pixel check is bracketed against a PROVEN-FAILING control: the old 0.26/0.42 constants are set deliberately and must read
// measurably darker than the shipped dial. Without that, a shader that had stopped drawing the band entirely would pass.
//
// usage: node bench/assert-band-fog.mjs
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

let checks=0, fails=0;
function ok(name, cond, detail){ checks++; if(!cond){ fails++; console.log('  FAIL  '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }
  else console.log('  ok    '+name+(detail!==undefined?('   '+JSON.stringify(detail)):'')); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.pinScene()');

    const dial=(mul,cap)=>page.evaluate('__hc.bandFog('+(mul==null?'':mul)+(cap==null?'':','+cap)+')');

    // ---- 1. THE DIAL IS THE CANOPY'S OWN EXPRESSION, not a constant of its own.
    // pineMat clamps its uFogAmt to clamp(_ef*0.93, 0, 0.97). These two numbers are that clamp, and the whole bug was that they
    // used to be 0.26 and 0.42 instead. If a later pass "tidies" them back to something local, this is where it is caught.
    const d0=await dial();
    console.log('  default dial: '+JSON.stringify(d0));
    ok('the band is allowed the canopy\'s own fog exposure (0.93 / 0.97)', d0.mul===0.93 && d0.cap===0.97, {mul:d0.mul, cap:d0.cap});

    // The shore view every band measurement in this repo uses: on the beach, looking along the coast, where the anchoring
    // uniforms are exactly 1 and the treeline is at the angular size Ben signed off.
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(3000);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)');
    await sleep(11000);   // QUIESCENCE: chunks still streaming behind the treeline read as the band changing colour.
    const anchor=await page.evaluate('__hc.treelineAnchor()');
    ok('this is the signed-off shore view (anchoring uniforms at 1)', anchor.push===1 && anchor.hide===1 && anchor.bandPush===1 && anchor.bandHide===1, anchor);

    // ---- 2. HAZE (uFogAmt), BY DAY AND BY NIGHT. The band must sit alongside the canopy, not at a fifth of it.
    async function haze(nm, t){
      await page.evaluate('__hc.setTime('+t+')'); await sleep(2500);
      const s=await dial(0.93,0.97);
      ok(nm+': the band breathes what the canopy breathes', s.bandFog>=s.pineFog*0.85, {band:s.bandFog, pine:s.pineFog});
      return s;
    }
    const dayS=await haze('day', 0.35);
    const nightS=await haze('night', 0.66);

    // ---- 3. AND IT IS VISIBLE IN THE FRAME, not just in a uniform. Photographed against the old constants as the control.
    // The clock is re-pinned before every frame: at dawn and dusk the sun moves several luminance per second, which is more than
    // this effect, and a bracket sampled seconds later differs by more than the dial changes.
    async function bandRows(tag, t){
      await page.evaluate('__hc.setTime('+t+')'); await sleep(700); await page.evaluate('__hc.setTime('+t+')'); await sleep(250);
      const f=path.join(OUT,'bandfog-assert-'+tag+'.png');
      await page.screenshot({path:f});
      const im=decodePNG(fs.readFileSync(f));
      // The band is a handful of rows tall at treeline distance. A first version of this measurement sampled 26 rows below the
      // canopy, which is the BEACH, and reported an identical colour for every setting of the dial.
      const rows=[];
      for(let y=Math.floor(im.h*0.28); y<Math.floor(im.h*0.82); y++){
        let r=0,g=0,b=0,n=0; for(let x=Math.floor(im.w*0.30);x<Math.floor(im.w*0.62);x++){ const i=(y*im.w+x)*im.ch; r+=im.data[i]; g+=im.data[i+1]; b+=im.data[i+2]; n++; }
        rows.push({y, lum:(0.2126*r+0.7152*g+0.0722*b)/n});
      }
      return rows;
    }
    // WHICH ROWS THE HORIZON LAYER OWNS, established by hiding it. Everything else in the frame -- the sea's Gerstner waves, the
    // beach, the moon -- animates on its own and is what put the night noise floor within a factor of two of the night signal.
    // The band's own rows are the only ones this dial can possibly move, so they are the only ones worth averaging.
    await page.evaluate('__hc.setTime(0.35)'); await sleep(1500);
    const layOn=await bandRows('layer-on',0.35);
    await page.evaluate('__hc.horizonDbg(true,false)'); await sleep(900);
    const layOff=await bandRows('layer-off',0.35);
    await page.evaluate('__hc.horizonDbg(true,true)'); await sleep(900);
    const owned=new Set();
    for(let i=0;i<layOn.length;i++) if(Math.abs(layOff[i].lum-layOn[i].lum)>2.0) owned.add(layOn[i].y);
    ok('the horizon layer owns a run of rows in this view', owned.size>=12, {rows:owned.size});

    // The night floor is 0.7 rather than the day's 6.0 because the whole frame is about six luminance out of 255 after dusk: the
    // band's rows move by ~1.0 there, which is a sixth of everything that is on screen, and no absolute threshold borrowed from
    // the daylight case can be met. Measured across four runs: 1.05, 1.00, 0.99, 0.99 against noise floors of 0.29 to 0.51, so
    // the ratio is the load-bearing half of this test and the absolute number only rules out a dead shader.
    for(const [nm,t,floor,ratio] of [['day',0.35,6.0,2.0],['night',0.66,0.7,1.8]]){
      await dial(0.26,0.42); const ctl=await bandRows(nm+'-old',t);
      await dial(0.93,0.97); const now=await bandRows(nm+'-now',t);
      await dial(0.26,0.42); const back=await bandRows(nm+'-old2',t);   // the control again — the noise floor of this whole method
      // MEAN row delta, not the worst row. The dial shifts every row of the band together, while the noise is a few stray rows
      // (a wave crest, a bird, the moon's edge), so a max-of-rows measure put the night signal at 3.1 against a noise floor of
      // 1.7 and could not separate them. Averaged, the broad shift survives and the sparse noise divides away.
      // THE MEAN OF THE 30 MOST-CHANGED ROWS. The worst single row cannot separate signal from noise at night (3.1 against 1.7);
      // the mean of the whole profile cannot either, because the band is 30 rows of the 390 sampled and averaging over the sky and
      // the beach divides a 16-luminance shift down to 1. The band's rows all move together, so the top of the sorted deltas IS
      // the band, while noise is a handful of stray rows that a 30-row mean flattens.
      const span=(a,b)=>{ const d=[]; for(let i=0;i<a.length;i++){ if(!owned.has(a[i].y)) continue; d.push(Math.abs(b[i].lum-a[i].lum)); }
        d.sort((x,y)=>y-x); const k=Math.min(30,d.length); let s=0; for(let i=0;i<k;i++) s+=d[i]; return k?s/k:0; };
      const moved=span(ctl,now), noise=span(ctl,back);
      ok(nm+': the shipped exposure changes the band on screen, past the noise floor', moved>floor && moved>noise*ratio,
         {movedLum:+moved.toFixed(2), noiseFloor:+noise.toFixed(2), needs:floor, needsRatio:ratio});
    }
    await dial(0.93,0.97);

    // ---- 4. THE WEATHER BANK still reaches it. This was the previous fix and it must not have been traded away: uWx drives a
    // FLOOR under the haze term, so in a bank the band washes out whatever the haze is doing.
    await page.evaluate('__hc.setTime(0.35)'); await sleep(1200);
    await page.evaluate('(()=>{ try{ return __hc.fog(0.8); }catch(e){ return __hc.cmdRun("/weather fog 0.8"); } })()');
    await sleep(6000);
    const wxS=await dial();
    ok('a fog bank floors the band\'s mix (the previous fix is still in force)', wxS.wx>0.4 && wxS.wxFloor>0.45 && wxS.effective>=wxS.wxFloor-1e-6, wxS);
    await page.evaluate('(()=>{ try{ return __hc.fog(0); }catch(e){ return __hc.cmdRun("/weather clear"); } })()');
    await sleep(5000);
    await page.evaluate('__hc.pinScene()'); await sleep(1200);

    // ---- 5. THE VOLUMETRIC PASS, which underwater is simply turned up: submerging sets scene.fog.density to 0.34, closing
    // visibility to eight or nine blocks. The band rides the same density through _ef, so it must go fully fogged down there
    // rather than hanging in the murk as a dark strip.
    // OFF THE COAST, not three blocks under the beach. The first version teleported straight down from the shore view and landed
    // inside the hillside, where the game is not submerged and the density never changes -- it read as a failure of the band.
    // A REAL PIECE OF SEA, found by walking out from the shore until the ground is below the waterline and there are still chunks
    // under it. Two wrong versions first: straight down from the beach put the camera inside the hillside, and island centre plus
    // the mean radius plus sixty put it at x=932 in a 529-block world -- outside it, where nothing streams and the horizon's
    // per-frame update reported the surface atmosphere while the water shader had already gone murky.
    let sx=P.x-30, sz=P.z, found=null;
    for(let i=1;i<=30 && !found;i++){
      const q=await page.evaluate('(()=>{ __hc.tpExact('+(sx-i*18)+', '+sz+', '+(P.sea+16)+'); return __hc.probe(); })()');
      await sleep(500);
      if(q.chunkHere && q.gyHere>1 && q.gyHere<=P.sea-2) found={x:sx-i*18, z:sz, gy:q.gyHere};
    }
    ok('found open sea to submerge in', !!found, found||{searched:'30 steps of 18 blocks seaward of the shore view'});
    if(found){ await page.evaluate('__hc.tpExact('+found.x+','+found.z+','+(P.sea+16)+')'); await sleep(3500); }
    const sub=await page.evaluate('(()=>{ const p=__hc.probe(); __hc.tpExact(p.x, p.z, '+(P.sea-3)+'); return __hc.probe(); })()');
    await sleep(4000);
    const subS=await dial();
    console.log('  underwater: '+JSON.stringify(subS)+'   probe '+JSON.stringify(sub)+'   atmosphere '+JSON.stringify(await page.evaluate('__hc.horizonDbg()')));
    ok('underwater the band is fully fogged', subS.bandFog>=0.9, {band:subS.bandFog, pine:subS.pineFog});
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2500);

    // ---- 6. THE BACKROOMS. This layer is a CHILD of pineLayer precisely so the eleven places that hide the horizon take the
    // band with it; a sibling would have left a dark strip hanging in the Backrooms. Checked because a shader edit here lands
    // in both worlds.
    await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return {err:String(e.message||e)}; } })()');
    await sleep(4000);
    const brS=await dial();
    console.log('  in the Backrooms: '+JSON.stringify(brS));
    ok('the horizon layer draws nothing in the Backrooms', brS.vis===false, {visible:brS.vis});
    await page.evaluate('(()=>{ try{ return __hcBR.exit(); }catch(e){ return null; } })()');
    await sleep(3000);

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
