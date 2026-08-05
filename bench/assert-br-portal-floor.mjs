// ASSERT: the Backrooms portal lands on the STOREY FLOOR indoors, not on the ceiling lid, and still lands on the
// terrain surface outdoors. Shipped at 8864c00 with "NOT VERIFIED BY A FRAME" written into the message; this is that
// verification, and it is deliberately arriving after the fix rather than being skipped.
//
// The check proves the old behaviour was wrong in the SAME run instead of reverting to watch it fail: __hcBR.doorAt()
// reports the door's y beside groundYAt for its own column. Indoors groundYAt returns the ceiling lid -- that value IS
// the old placement -- so the assertion is that the door sits at the floor while groundYAt sits a storey above it. If
// those two ever agree indoors, either the bug is back or the maze stopped having a ceiling.
//
// usage: node bench/assert-br-portal-floor.mjs   -> bench/results/brportal-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

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
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(52)+' got='+JSON.stringify(got)); }

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
    // The maze seed is random per door by design, so a bare run is a different building every time and a failure cannot
    // be looked at twice. ?brseed pins it; pass a seed as argv[2] to reproduce one.
    const SEED = process.argv[2]!=null ? String(process.argv[2]) : null;
    console.log(SEED!=null ? 'maze seed pinned to '+SEED : 'maze seed RANDOM (pass a seed as argv[2] to pin)');
    await page.goto(base+'/index.html?debug=1&rd=8'+(SEED!=null?'&brseed='+SEED:''), { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');

    console.log('\n[1] OUTSIDE — the portal stands on the terrain surface');
    await page.evaluate('__hcBR.door()'); await sleep(1200);
    const O = await page.evaluate('__hcBR.doorAt()');
    console.log('  '+JSON.stringify(O));
    ok('outdoors, spawned outside the Backrooms', O && O.inside===false, O&&O.inside);
    ok('sill is at the surface height for its column', O && Math.abs(O.y-O.fromTop)<0.51, O&&[O.y,O.fromTop]);
    ok('the sill itself is air, not buried', O && O.airAtSill===true, O&&O.airAtSill);
    await page.screenshot({ path: path.join(OUT,'brportal-outside.png') });

    console.log('\n[2] INSIDE — the portal stands on this storey, and NOT where groundYAt points');
    await page.evaluate('__hcBR.enter()'); await sleep(2500);
    // Several spots, not one. Under stacked levels each BRX chunk sits at its own height, so a single sample can easily
    // land on the TOP storey where no lid exists overhead -- exactly the case the roof bug cannot show up in.
    let I=null, withLid=0, skipped=0;
    for(const [dx,dz] of [[0,0],[40,0],[0,40],[-60,30],[80,-40]]){
      await page.evaluate('__hcBR.tp('+dx+','+dz+')'); await sleep(2200);
      // Wait until the player has LANDED. tp drops them at the entry chunk's floor height, which over a lower storey
      // means they are still falling; the door's storey is read from the floor under the player, and mid-air that is a
      // different storey from the one they end up standing on.
      await page.waitForFunction('(()=>{try{return __hcBR.doorAt===undefined||__hc.st().onGround===true;}catch(e){return true;}})()',null,{timeout:12000}).catch(()=>console.log('  (never landed)'));
      await page.evaluate('__hcBR.door()'); await sleep(1200);
      const R = await page.evaluate('__hcBR.doorAt()');
      const lid = R && Math.abs(R.fromTop-R.y)>2; if(lid) withLid++;
      console.log('  tp('+dx+','+dz+')  '+JSON.stringify(R));
      // Not a placement fault and not tuned away: the teleport put the player INSIDE concrete, where no door position is
      // correct and no real player can stand. Skipped and counted, so a run that skips everything cannot read as a pass.
      if(R && R.playerInRock){ skipped++; console.log('  SKIP tp('+dx+','+dz+'): the teleport landed the player inside solid rock, so there is no legal door position to check'); continue; }
      ok('tp('+dx+','+dz+'): sill on the same storey as the floor under the player',
         R && Math.abs(R.y-R.playerFloor)<8, R&&{sill:R.y,playerFloor:R.playerFloor,playerY:R.playerY,onGround:R.onGround});
      ok('tp('+dx+','+dz+'): solid under the sill, air at it', R && R.solidUnderSill===true && R.airAtSill===true, R&&[R.solidUnderSill,R.airAtSill]);
      if(lid||!I) I=R;   // keep a column WITH a lid overhead for the detailed section below, if any turned up
    }
    console.log('  columns with a ceiling lid overhead (where the roof bug could bite): '+withLid+' of 5, skipped '+skipped);
    ok('at least one sample had a lid overhead', withLid>=1, withLid);
    ok('at least three samples were actually testable', 5-skipped>=3, 5-skipped);
    ok('inside the Backrooms', I && I.inside===true, I&&I.inside);
    // The one that matters: the door is on the storey the player is standing on, not on the roof above it. The roof bug
    // put it a full BR_CH=9 up, so this is the assertion that separates fixed from broken.
    ok('sill is on the player\'s own storey', I && Math.abs(I.y-I.playerFloor)<8, I&&[I.y,I.playerFloor]);
    ok('solid floor under the sill', I && I.solidUnderSill===true, I&&I.solidUnderSill);
    ok('the sill itself is air, not inside a slab', I && I.airAtSill===true, I&&I.airAtSill);
    ok('and air above it, so the door has a doorway', I && I.airAboveSill===true, I&&I.airAboveSill);
    // The old placement, measured in the same run rather than asserted from memory. A column with a lid overhead reports
    // fromTop well above the player; where the player is on the TOP storey there is no lid and the two agree, which is
    // not a failure -- so this is reported, not asserted.
    console.log('  old placement (scan from column top) = '+I.fromTop+'   new (scan from the player) = '+I.fromPlayer
      +'   topSolid='+I.topSolid+(Math.abs(I.fromTop-I.y)>2?'   <- the roof bug would have hit here':'   <- no lid above this column, both agree'));
    ok('the shipped code used the scan-from-player answer', I && Math.abs(I.y-I.fromPlayer)<0.01, I&&[I.y,I.fromPlayer]);

    // A FRAME, from close enough and in a lit room, because "is it standing on the floor" is finally a thing a person
    // judges. goPoint stands the player back from the portal's own column, facing it; the numbers above say what height
    // it should be at, and this says whether it looks like a doorway rather than a hole in a roof.
    // Two shots: at the sill, and pitched down, so the frame shows the join between the portal and the carpet.
    const stand = await page.evaluate('__hcBR.goPoint('+I.x+','+I.z+',4.5,'+(0)+')');
    console.log('  stood at '+JSON.stringify(stand));
    await sleep(1500);
    // Parenthesise the interpolated coords: a negative z turned "d.z-"+z into "d.z--49.5", which is a syntax error.
    console.log('  aimed: '+JSON.stringify(await page.evaluate('(()=>{ const d=__hcBR.doorAt(); const a=Math.atan2(-(d.x-('+stand.x+')),-(d.z-('+stand.z+'))); return __hcBR.look(a,-0.12); })()')));
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT,'brportal-inside-close.png') });
    await page.screenshot({ path: path.join(OUT,'brportal-inside.png') });

    console.log('\n[3] no page errors across the run');
    ok('no page errors', errs.length===0, errs.length);

    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    console.log('shots: bench/results/brportal-outside.png, brportal-inside.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
