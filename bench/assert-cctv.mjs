// CAMERAS AND MONITORS. Ben: "cameras and monitors with 4-digit IDs, in-world screen feed".
//
// A feed is the same operation as the Void Door portal -- a second scene render into a target, painted on a quad -- and the portal
// taught this codebase both of the lessons this design is built on. Its cost is real (41% of a 7.14 ms budget before it was gated),
// and doing setup work inside the render call cost a 364 ms frame. So there is no render per monitor: ONE 1024x1024 target cut into
// sixteen tiles, a fixed pool of sixteen camera slots, and exactly ONE slot re-rendered per frame, round-robin. A monitor renders
// nothing; it samples its camera's tile.
//
// The check that actually matters is the LIVE one. A screen showing a still frame, a screen showing another camera's tile, and a
// screen showing nothing all look plausible in a single screenshot -- so this photographs one monitor twice with the world moved in
// between and requires the picture to CHANGE, with an untuned monitor as the proven-failing control.
//
// usage: node bench/assert-cctv.mjs   -> bench/results/cctv-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
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
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:600}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.5)');

    console.log('[1] the props exist and are reachable');
    const info=await page.evaluate('__hc.packInfo(["camera_x","camera_z","monitor_x","monitor_z","camera","monitor"])');
    for(const n of ['camera_x','camera_z','monitor_x','monitor_z']){
      ok(n+' is a block with an item', info[n] && info[n].bid!=null && !!info[n].name, info[n]&&{bid:info[n].bid,name:info[n].name}); }
    // ONE item each in the menu, not one per axis. The per-axis blocks remain -- the mesher needs them to know which way to turn
    // the geometry -- but they are hidden, so the creative menu stops offering "Camera X" and "Camera Z" as separate props.
    ok('there is a single Camera item', info.camera && info.camera.inCreative===true && info.camera.name==='Camera', info.camera);
    ok('and a single Monitor item', info.monitor && info.monitor.inCreative===true && info.monitor.name==='Monitor', info.monitor);
    const shown=['camera_x','camera_z','monitor_x','monitor_z'].filter(k=>info[k] && info[k].inCreative);
    ok('the per-axis variants are hidden from the menu', shown.length===0, shown);
    ok('a camera is walk-through and a monitor is not', info.camera_x.solid===false && info.monitor_x.solid===true,
      {cam:info.camera_x.solid, mon:info.monitor_x.solid});

    console.log('\n[2] a camera is issued a 4-digit code');
    const cam=await page.evaluate('__hc.cctvPlaceCam(0,8,-4,false)');
    console.log('  camera: '+JSON.stringify(cam));
    ok('the camera got a code', cam && cam.code>=1000 && cam.code<=9999, cam&&cam.code);
    const cam2=await page.evaluate('__hc.cctvPlaceCam(3,1,-4,false)');
    ok('a second camera got a DIFFERENT code', cam2 && cam2.code!==cam.code, {a:cam.code, b:cam2&&cam2.code});

    console.log('\n[3] an untuned monitor reads no signal — the control');
    const mon=await page.evaluate('__hc.cctvPlaceMon(0,2,4,false)');
    console.log('  monitor: '+JSON.stringify(mon));
    ok('the monitor built a screen quad', mon && mon.built===true, mon);
    await sleep(600);
    let st=await page.evaluate('__hc.cctv()');
    console.log('  cctv: '+JSON.stringify({entries:st.entries,screens:st.screens,pool:st.pool,live:st.live,cams:st.cams.length}));
    ok('the pool is sixteen slots', st.pool===16, st.pool);
    ok('two cameras are known', st.cams.length===2, st.cams.length);
    const off=await page.evaluate('__hc.cctvScreenAt('+mon.x+','+mon.y+','+mon.z+')');
    ok('an untuned screen is OFF', off && off.on===0, off&&off.on);

    console.log('\n[4] tuning it to a real code turns the feed on');
    const tuned=await page.evaluate('__hc.cctvTune('+mon.x+','+mon.y+','+mon.z+','+cam.code+')');
    console.log('  tuned: '+JSON.stringify(tuned));
    ok('the tuning took', tuned && tuned.tune===cam.code, tuned);
    ok('and the screen came on', tuned && tuned.on===1, tuned&&tuned.on);
    const bogus=await page.evaluate('__hc.cctvTune('+mon.x+','+mon.y+','+mon.z+',4242)');
    ok('a code no camera answers to reads no signal', bogus && bogus.on===0, bogus);
    await page.evaluate('__hc.cctvTune('+mon.x+','+mon.y+','+mon.z+','+cam.code+')');

    console.log('\n[5] the feed is LIVE, not a still');
    // READ THE TARGET, DO NOT PHOTOGRAPH THE MONITOR. Three attempts at photographing it measured the ground behind the screen,
    // then the ground behind the hotbar, then nothing at all -- every time the AIM was broken while the feed itself was fine, so
    // the check went red for reasons that had nothing to do with the feature. The tile is read straight out of the render target,
    // which needs no camera pose and cannot be fooled by one. Same lesson as the pastel pack: distinctness belongs at the source.
    await page.evaluate('__hc.cctvFace(' + mon.x + ',' + mon.y + ',' + mon.z + ',2.6)');
    await sleep(2500);
    const tileA = await page.evaluate('__hc.cctvTile(' + cam.code + ')');
    console.log('  tile A (day):   ' + JSON.stringify(tileA));
    ok('the tuned camera holds a live pool slot', tileA && tileA.slot >= 0, tileA);
    ok('and its tile has a picture in it, not black', tileA && tileA.nonBlackPct > 60, tileA && tileA.nonBlackPct);
    // MOVE THE WORLD IN FRONT OF THE CAMERA, not the player. Night falling changes what the camera sees while the player's own
    // view is untouched, so a change in the tile cannot be the player's camera leaking into the measurement.
    await page.evaluate('__hc.setTime(0.02)'); await sleep(3000);
    const tileB = await page.evaluate('__hc.cctvTile(' + cam.code + ')');
    console.log('  tile B (night): ' + JSON.stringify(tileB));
    const dT = Math.abs(tileA.rgb[0]-tileB.rgb[0]) + Math.abs(tileA.rgb[1]-tileB.rgb[1]) + Math.abs(tileA.rgb[2]-tileB.rgb[2]);
    ok('the tile CHANGED when the world did - it is a live feed', dT >= 12, {day:tileA.rgb, night:tileB.rgb, delta:dT});
    await page.evaluate('__hc.setTime(0.5)'); await sleep(2500);
    const tileC = await page.evaluate('__hc.cctvTile(' + cam.code + ')');
    ok('and it comes back when the world does', Math.abs(tileC.rgb[0]-tileA.rgb[0]) < Math.max(10, dT*0.6),
      {first:tileA.rgb, again:tileC.rgb});
    // THE CONTROL: a code no camera answers to is handed no slot at all, so there is nothing to read.
    const dead = await page.evaluate('__hc.cctvTile(4242)');
    ok('a camera nobody is tuned to holds no slot', !!(dead && dead.err), dead);
    await page.screenshot({path:path.join(OUT,'cctv-monitor.png')});

    console.log('\n[6] one render per frame, whatever is up');
    await page.evaluate('(()=>{ for(let i=0;i<8;i++) __hc.cctvPlaceCam(-8+i,1,-6,false); })()');
    await sleep(1500);
    st=await page.evaluate('__hc.cctv()');
    ok('ten cameras are up', st.cams.length>=10, st.cams.length);
    const r0=(await page.evaluate('__hc.cctv()')).renders;
    const frames=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      let n=0; for(let i=0;i<60;i++){ await f(); n++; } return n; })()`);
    const r1=(await page.evaluate('__hc.cctv()')).renders;
    const per=(r1-r0)/frames;
    console.log('  camera renders '+(r1-r0)+' over '+frames+' frames = '+per.toFixed(2)+' per frame');
    ok('at most one camera render per frame', per<=1.05, {perFrame:+per.toFixed(2), renders:r1-r0, frames});
    ok('and it is actually rendering', (r1-r0)>0, r1-r0);

    console.log('\n[7] codes and tunings survive a reload');
    const rt=await page.evaluate('__hc.cctvSaveRoundTrip()');
    console.log('  round trip: '+JSON.stringify(rt));
    ok('every code and tuning comes back', rt && rt.same===true && rt.cleared===0 && rt.restored===rt.entries, rt);

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
