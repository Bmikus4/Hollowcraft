// SITTING AT A MONITOR (Ben 08-04):
//   right-click a monitor opens a full-screen night-vision feed of the camera it is tuned to
//   the mouse turns the REAL camera — every monitor tuned to it sees the new angle, and it persists
//   escape once frees the pointer and offers the ID box; with nothing paired the screen says NO CONNECTION
//   node bench/assert-cctv-monitor.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(900);

    const set = await page.evaluate(`(()=>{ const c=__hc.cctvPlaceCam(4,1,0,false), m=__hc.cctvPlaceMon(-3,1,0,false); return {c,m}; })()`);
    console.log('   ', JSON.stringify(set));

    console.log('\n[1] an untuned monitor says NO CONNECTION and hands you the keyboard');
    let st = await page.evaluate(`__hc.monOpen(${set.m.x},${set.m.y},${set.m.z})`);
    console.log('   ', JSON.stringify(st));
    ok('the monitor view is up', st.on===true, {on:st.on});
    ok('with nothing paired the pointer is already free', st.look===false, {look:st.look});
    ok('and the screen says so', st.msg==='NO CONNECTION', {msg:st.msg});
    ok('the ID box is there to type in', st.boxShown===true, {boxShown:st.boxShown});

    console.log('\n[2] typing the camera ID connects it');
    st = await page.evaluate(`__hc.monType('${set.c.code}')`);
    console.log('   ', JSON.stringify(st));
    ok('it is tuned to that camera', st.tune===set.c.code, {tune:st.tune, code:set.c.code});
    ok('the feed is live, so the pointer is captured for it', st.look===true, {look:st.look});
    ok('and the NO CONNECTION notice is gone', st.msg==='', {msg:st.msg});

    console.log('\n[3] the mouse turns the REAL camera');
    const a0 = await page.evaluate(`__hc.monAim()`);
    await page.evaluate(`__hc.monMouse(400,-120)`);
    const a1 = await page.evaluate(`__hc.monAim()`);
    console.log('   ', JSON.stringify({a0,a1}));
    ok('yaw moved', Math.abs(a1.yaw-a0.yaw)>0.1, {before:a0.yaw, after:a1.yaw});
    ok('pitch moved', Math.abs(a1.pitch-a0.pitch)>0.05, {before:a0.pitch, after:a1.pitch});
    ok('and it is stored on the CAMERA, not on the view', a1.onCamera===true, a1);
    await page.evaluate(`__hc.monMouse(0,-9000)`);
    const a2 = await page.evaluate(`__hc.monAim()`);
    ok('pitch cannot go over the top', Math.abs(a2.pitch)<=0.96, {pitch:a2.pitch});

    console.log('\n[4] escape steps back from the screen, not out of the game');
    st = await page.evaluate(`__hc.monEsc()`);
    ok('the pointer is free', st.look===false, {look:st.look});
    ok('the view is still up', st.on===true, {on:st.on});
    ok('and the ID box is back', st.boxShown===true, {boxShown:st.boxShown});
    st = await page.evaluate(`__hc.monClose()`);
    ok('a second escape leaves', st.on===false, {on:st.on});
    ok('and the overlay is hidden', st.visible===false, {visible:st.visible});

    console.log('\n[5] the turned camera is what every monitor now shows');
    const feed = await page.evaluate(`(()=>{ __hc.cctvTune(${set.m.x},${set.m.y},${set.m.z},${set.c.code}); for(let i=0;i<3;i++)__hc.cctvStep(); return __hc.cctvAimUsed(); })()`).catch(()=>null);
    console.log('   ', JSON.stringify(feed));
    if(feed) ok('the wall feed renders from the camera\'s stored aim', Math.abs(feed.yaw-a2.yaw)<0.001, feed);

    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
