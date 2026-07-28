// FOG REACH (Ben 07-28: "pushed 3x farther away during the day, and moved closer (black) during the night"). Reach is not
// density — it is 1/density — so this measures the distance at which the bank reaches ~99% opacity, at noon and at midnight,
// and checks the ratio between them rather than trusting a constant I typed.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
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
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`__hc.aim(false)`);
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    const now=await page.evaluate(`__hc.time()`); const DAY_LEN = now.frac>0.001 ? now.worldTime/now.frac : 600;

    const read=async(frac)=>{ await page.evaluate(`__hc.time(${frac*DAY_LEN})`); await sleep(900);
      return await page.evaluate(`__hc.fogInfo()`); };
    const noon=await read(0.30), night=await read(0.90);
    console.log('noon :', JSON.stringify(noon));
    console.log('night:', JSON.stringify(night));
    T('the fog readout is live', noon.density>0 && night.density>0, {noon:noon.density, night:night.density});
    // 3x farther by day than it WAS. The previous day coefficient was 0.85; the reach ratio is the coefficient ratio.
    T('day fog reaches 3x farther than the old 0.85 coefficient', Math.abs(noon.coef*3 - 0.85) < 0.06, {coef:+noon.coef.toFixed(3), want:+(0.85/3).toFixed(3)});
    T('night fog is closer than it was at 1.10', night.coef > 1.10+0.2, {coef:+night.coef.toFixed(3)});
    T('day reaches much farther than night', noon.reach > night.reach*4, {dayReach:Math.round(noon.reach), nightReach:Math.round(night.reach)});
    // the night bank must be BLACK, which is the fog COLOUR, not its density
    T('the night bank is black', night.colorLum < 0.09, {colorLum:+night.colorLum.toFixed(4), rgb:night.color});
    T('the day haze is not black', noon.colorLum > 0.35, {colorLum:+noon.colorLum.toFixed(4)});
    // ---- THE COLOUR THE TREES FADE TO (Ben 07-28) ----
    // Two separate things, both wrong in opposite directions. The HORIZON PINE silhouette faded toward a flat tenth of the fog
    // colour at every hour, so by day it was a black cutout instead of melting into white haze. And the WEATHER fog colour
    // barely moved with the hour (0.34 at midnight against a 0.03 sky), so in night rain the real worldgen trees washed out
    // to a pale blue-white glowing mass — which is what Ben photographed.
    T('by day the horizon pines fade toward WHITE haze', noon.pineFogLum > 0.35, {pineFog:noon.pineFog, lum:+noon.pineFogLum.toFixed(4)});
    T('at night they fade toward near-black', night.pineFogLum < 0.05, {pineFog:night.pineFog, lum:+night.pineFogLum.toFixed(4)});
    for(const [name,frac,limit] of [['night',0.90,0.10],['day',0.30,null]]){
      await page.evaluate(`__hc.time(${frac*DAY_LEN})`); await sleep(400);
      await page.evaluate(`__hc.fog(0.9)`); await sleep(900);                       // force a heavy weather bank
      const wet=await page.evaluate(`__hc.fogInfo()`);
      // The picture is taken at a MODEST bank, not the 0.9 the assertions use: at 0.9 the fog shell is 98% opaque by design
      // and the frame is a flat wash, which shows nothing about what the trees fade to.
      await page.evaluate(`__hc.fog(0.28)`); await sleep(800);
      await page.evaluate(`(()=>{ const p=__hc.pos(); __hc.look(p.x+300,p.y+40,p.z+120); })()`); await sleep(700);
      await page.screenshot({path:path.join(ROOT,'bench','results','fog-trees-'+name+'.png')});
      await page.evaluate(`__hc.fog(0.9)`); await sleep(600);
      console.log(name+' + heavy weather fog:', JSON.stringify({color:wet.color, lum:+wet.colorLum.toFixed(4), pineFog:wet.pineFog, wx:wet.wx}));
      if(limit!=null){
        T('in night rain the fog stays dark, so distant trees do not glow', wet.colorLum < limit, {colorLum:+wet.colorLum.toFixed(4), rgb:wet.color});
        T('…and the horizon pines stay dark with it', wet.pineFogLum < limit, {pineFog:wet.pineFog}); }
      else T('by day a weather bank is still pale', wet.colorLum > 0.30, {colorLum:+wet.colorLum.toFixed(4)});
    }
    await page.evaluate(`__hc.fog(0)`);
    // and the VISUALS Fog dial still moves it
    await page.evaluate(`__hc.time(${0.9*DAY_LEN})`); await sleep(500);
    const base2=await page.evaluate(`__hc.fogInfo()`);
    await page.evaluate(`__hc.vis({fogmul:2})`); await sleep(700);
    const doubled=await page.evaluate(`__hc.fogInfo()`);
    T('the Fog dial still scales it', doubled.density > base2.density*1.6, {at1:base2.density, at2:doubled.density});
    await page.evaluate(`__hc.vis({fogmul:1})`);
    T('zero page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('\n'+fails+' FAILING') : '\nALL PASS');
  process.exit(fails?1:0);
})();
