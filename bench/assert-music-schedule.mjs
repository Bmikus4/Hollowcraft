// THE SOUNDTRACK'S THREE STATES: two minutes of silence at the start of a session, the existing loop in ordinary weather, and
// the added track whenever it is RAINING. Uses the real sounds/rain_music.ogg if it is there and a short stand-in if it is not,
// so this proves the SWITCH rather than the contents of any file.
//   node bench/assert-music-schedule.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0;
const ok=(name,cond,got)=>{ if(!cond)fails++; console.log(`  ${cond?'ok  ':'FAIL'}  ${name}   ${JSON.stringify(got)}`); };
const INTRO=path.join(ROOT,'sounds','rain_music.ogg');
const STAND_IN=path.join(ROOT,'sounds','cord1.ogg');
(async()=>{
  const hadReal=fs.existsSync(INTRO);
  if(!hadReal) fs.copyFileSync(STAND_IN, INTRO);   // a real track, if present, is used as-is and left alone
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1500);

    const quiet = await page.evaluate(`__hc.musicProbe()`);
    console.log('  opening silence:', JSON.stringify(quiet));
    ok('the session clock is running', quiet.clockRunning===true, quiet.elapsed);
    ok('the opening silence is 3 minutes', quiet.silence===180, quiet.silence);
    ok('nothing plays during it', quiet.loopPlaying===false && quiet.rainPlaying===false, {loop:quiet.loopPlaying, rain:quiet.rainPlaying});
    ok('and the schedule agrees nothing should', quiet.want==='none', quiet.want);

    // past the opening silence, dry weather -> the existing soundtrack, FADED IN
    const dry = await page.evaluate(`(()=>{ __hc.musicRain(0); __hc.musicSkew(181); return __hc.musicTick(4,0.05); })()`);
    console.log('  first note:', JSON.stringify(dry));
    ok('the soundtrack starts', dry.loopPlaying===true, {loop:dry.loopPlaying, want:dry.want});
    ok('it starts NEAR SILENT — a fade, not a cut', dry.loopVol<0.06, dry.loopVol);
    ok('and a fade-in is actually registered', dry.fades.some(f=>f.which==='loop'&&f.dir>0), dry.fades);
    const grown = await page.evaluate(`__hc.musicTick(60,0.05)`);   // 3 s of fade
    ok('the fade climbs over seconds, not frames', grown.loopVol>dry.loopVol, {from:dry.loopVol, to:grown.loopVol});
    const full = await page.evaluate(`__hc.musicTick(140,0.05)`);   // past the 8 s fade
    ok('and it reaches the set level', Math.abs(full.loopVol-0.3)<0.02 && full.fades.length===0, {vol:full.loopVol, fades:full.fades});

    // rain: the soundtrack fades OUT, then three minutes of nothing, then the rain track fades IN
    const wet0 = await page.evaluate(`__hc.musicRain(0.7)`);
    ok('rain asks for the rain track', wet0.want==='rain', {want:wet0.want, rain:wet0.rain});
    const out1 = await page.evaluate(`__hc.musicTick(20,0.05)`);
    ok('the old track fades out rather than stopping dead', out1.fades.some(f=>f.dir<0) || out1.loopPlaying===false, out1.fades);
    const out2 = await page.evaluate(`__hc.musicTick(120,0.05)`);   // past the 4 s fade-out
    console.log('  handover:', JSON.stringify(out2));
    ok('it is stopped once the fade completes', out2.loopPlaying===false, out2.loopPlaying);
    ok('a 3-minute gap opens', out2.gap===180 && out2.inGap===true, {gap:out2.gap, inGap:out2.inGap});
    ok('and NOTHING plays inside the gap', out2.rainPlaying===false, out2.rainPlaying);
    const past = await page.evaluate(`(()=>{ __hc.musicSkew(181+185); return __hc.musicTick(4,0.05); })()`);
    console.log('  after the gap:', JSON.stringify(past));
    ok('after the gap the rain track comes in', past.rainPlaying===true, {rain:past.rainPlaying, want:past.want});
    ok('…on a fade of its own', past.rainVol<0.06 && past.fades.some(f=>f.which==='rain'&&f.dir>0), {vol:past.rainVol, fades:past.fades});

    // the boss is exempt: it cuts in at full level and does not wait for anything
    const boss = await page.evaluate(`(()=>{ startBossMusic(); return __hc.musicProbe(); })()`).catch(()=>null);
    if(boss && !boss.err){ ok('boss music does not fade in', boss.boss===true && boss.bossVol>0.5, {boss:boss.boss, vol:boss.bossVol});
      const back = await page.evaluate(`(()=>{ stopBossMusic(); return __hc.musicTick(4,0.05); })()`);
      ok('and handing back goes through the fade machine', back.boss===false, {boss:back.boss, fades:back.fades}); }
    else console.log('  (boss music not reachable from the page scope — skipped)');

    ok('no page errors', errors.length===0, errors);
    await browser.close();
  } finally {
    server.kill();
    if(!hadReal) { try{ fs.unlinkSync(INTRO); }catch(e){} }
  }
  console.log(`\n${fails} failed`);
  console.log('RESULT: '+(fails?'FAIL':'PASS'));
  process.exit(fails?1:0);
})();
