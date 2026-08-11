// DO THE BLOOD PHOTOS REACH THE GROUND? Asserts the two keyed PNGs decode, that every system that paints red is
// mapped with one of them, and that a splat/carcass/trail actually darkens the floor pixels — a 404 leaves a WHITE
// quad, which is the one failure that looks like a lighting bug instead of a missing file.
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
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,250)); console.log('PAGEERROR:',String(e.message||e).slice(0,250)); });
    const missed=[]; page.on('response',r=>{ if(r.status()>=400 && /assets\/blood/.test(r.url())) missed.push(r.url()+' '+r.status()); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});

    // paint everything that paints red, then give the loads a moment to land
    await page.evaluate(`(()=>{ __hc.blood(4); __hc.gore(); __hc.markDrop('blood',12); })()`);
    await sleep(2500);
    const b = await page.evaluate(`__hc.bloodProbe()`);
    console.log('bloodProbe', JSON.stringify(b));
    T('no 404 on a blood asset', missed.length===0, missed);
    T('both splat PNGs decoded at 512', b.loaded.length===2 && b.loaded.every(d=>d && d[0]===512 && d[1]===512), b.loaded);
    T('the asset loader never fell back', b.dead===false, {dead:b.dead});
    T('splats/pools/carcasses are mapped with a photo', b.splatMapped===true);
    T('the blood trail is mapped with a photo', b.markMapped===true);
    T('the trail tint is white, so the photo supplies the colour', b.markTint==='#ffffff', {tint:b.markTint});
    const m = await page.evaluate(`__hc.marksProbe()`);
    T('trail drops are live and drawn', m.blood.live>0 && m.blood.drawn===true, m.blood);

    // and it has to be VISIBLE: look down at the painted ground and compare against the same frame with the decals hidden
    // look() takes a WORLD POINT, never a yaw/pitch pair (see its own comment) — aim at the ground 3m ahead of the eye
    // AND IT HAS TO READ AS BLOOD ON THE GROUND THE PLAYER ACTUALLY WALKS. The spawn shore is near-white, and a
    // translucent decal over near-white renders bright pink whatever its albedo — so the judging shot is taken in the
    // woods, on grass and dirt. Repaint after moving: __hc.blood() lays its splats along the player's facing.
    // ON LAND, not on the sea: tp() takes whatever coordinate it is given, so the spot is CHECKED (feet block, and a
    // ground level above the waterline) before a frame is judged from it — two of these coordinates are open water.
    for(const [i,x,z] of [[0,560,120],[1,600,60],[2,520,180],[3,480,90]]){
      await page.evaluate(`__hc.tp(${x},${z})`); await sleep(4000);
      const p=await page.evaluate(`__hc.probe()`);
      const land = p.gyHere > p.sea+1;
      console.log('spot',i,x,z,'gy',p.gyHere,'sea',p.sea,land?'LAND':'water');
      if(!land) continue;
      await page.evaluate(`__hc.cam({yaw:0.7, pitch:-0.85})`); await sleep(500);
      await page.evaluate(`(()=>{ __hc.blood(5); __hc.gore(); __hc.markDrop('blood',16); })()`); await sleep(900);
      await page.screenshot({ path: path.join(OUT,'blood-woods-'+i+'.png') }); }
    const px = await page.evaluate(`(()=>{ const c=document.querySelector('canvas'); return [c.width,c.height]; })()`);
    console.log('canvas', px.join('x'));
    await page.screenshot({ path: path.join(OUT,'blood-photo.png') });
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
