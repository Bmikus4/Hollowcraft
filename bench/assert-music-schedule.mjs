// THE SOUNDTRACK'S OPENING ORDER: two minutes of silence -> the opening track, once -> the existing looping soundtrack.
// A short stand-in is copied to sounds/intro_music.ogg for the run and removed afterwards, so this proves the SCHEDULE
// rather than the contents of any particular file. Run it again after dropping the real track in and the same checks hold.
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
const INTRO=path.join(ROOT,'sounds','intro_music.ogg');
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
    ok('nothing plays in the first two minutes', quiet.loopPlaying===false && quiet.introPlaying===false, {loop:quiet.loopPlaying, intro:quiet.introPlaying});
    ok('the silence is 120 s', quiet.silence===120, quiet.silence);

    const atTwo = await page.evaluate(`__hc.musicSkew(121)`);
    await sleep(600);
    const afterSilence = await page.evaluate(`__hc.musicProbe()`);
    console.log('  after the silence:', JSON.stringify(afterSilence));
    ok('the opening track is what starts', afterSilence.intro!=='pending' || afterSilence.introPlaying===true, {intro:afterSilence.intro, playing:afterSilence.introPlaying});
    ok('the looping soundtrack is NOT playing under it',
       afterSilence.intro==='done' ? true : (afterSilence.loopPlaying===false || afterSilence.loopVol===0),
       {intro:afterSilence.intro, loop:afterSilence.loopPlaying, vol:afterSilence.loopVol});

    const handover = await page.evaluate(`__hc.musicIntroEnd()`);
    await sleep(400);
    const settled = await page.evaluate(`__hc.musicProbe()`);
    console.log('  handover:', JSON.stringify(settled));
    ok('the opening track is marked done', settled.intro==='done', settled.intro);
    ok('the existing soundtrack takes over', settled.loopPlaying===true, {loop:settled.loopPlaying, vol:settled.loopVol});
    ok('and it is audible rather than ducked', settled.loopVol>0, settled.loopVol);
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
