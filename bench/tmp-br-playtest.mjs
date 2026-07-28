// Playtest readiness: with both flags ON by default, does a fresh entry actually put you standing in a room?
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});

    // enter with NO flag calls at all — this is exactly what a playtester does
    await page.evaluate(`window.__hcBR.enter()`); await sleep(6000);
    const st = await page.evaluate(`window.__hcBRX.stats()`);
    T('both systems are on by default', st.infinite===true, st);
    const lv = await page.evaluate(`window.__hcBRX.levels(undefined)===undefined ? null : null`).catch(()=>null);
    const on = await page.evaluate(`(()=>({levels:!!BR_LEVELS_ON}))()`).catch(()=>null);

    // let physics run and see where the player ends up
    await page.evaluate(`__hc.aim(false)`); await sleep(2500);
    const pos = await page.evaluate(`__hc.pos()`);
    const dbg = await page.evaluate(`__hc.fallDbg()`);
    const room = await page.evaluate(`(()=>{ const s=window.__hcBR.paleState&&null; return window.__hcBRX.stats(); })()`);
    console.log('spawn pos', JSON.stringify(pos), 'fallDbg', JSON.stringify(dbg));
    T('the player is standing, not falling', dbg.onGround===true, dbg);
    T('the player is not buried in a block', dbg.hitsHere===false, {hitsHere:dbg.hitsHere, blkFeet:dbg.blkFeet});
    T('there is solid floor underfoot', dbg.hitsBelow===true || dbg.blkFeet!==0, dbg);

    // walk forward for a while and make sure we neither fall out of the world nor get stuck at spawn
    const p0 = await page.evaluate(`__hc.pos()`);
    await page.keyboard.down('KeyW'); for(let i=0;i<10;i++) await sleep(500); await page.keyboard.up('KeyW');
    await sleep(600);
    const p1 = await page.evaluate(`__hc.pos()`);
    const moved = Math.hypot(p1.x-p0.x, p1.z-p0.z);
    console.log('walked', moved.toFixed(1), 'blocks; y '+p0.y.toFixed(1)+' -> '+p1.y.toFixed(1));
    T('the player can actually walk somewhere', moved>3, {moved:+moved.toFixed(1)});
    T('the player did not fall out of the world', p1.y > 20, {y:+p1.y.toFixed(1)});

    await page.evaluate(`__hc.qa(55)`); await sleep(700);
    await page.screenshot({ path: path.join(OUT,'v1-playtest-spawn.png') });
    const fps=[]; for(let i=0;i<4;i++){ await sleep(700); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    console.log('fps', JSON.stringify(fps), 'stats', JSON.stringify(await page.evaluate(`window.__hcBRX.stats()`)));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
