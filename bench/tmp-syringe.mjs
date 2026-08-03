// THE SYRINGE, LOOKED AT. Ben: "do a clean pass on the syringe item, texturing it".
//
// Three places the same model appears, and a texture that reads at one scale can vanish at another: the hotbar ICON (a 3D
// snapshot), the item HELD in the main hand, and the item in the OFFHAND -- which matters because a syringe is long and thin
// and the offhand fit floors the shortest axis, so it is a candidate for coming out as a sliver.
//
// usage: node bench/tmp-syringe.mjs
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
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(5000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.28)'); await sleep(1200);

    const id=await page.evaluate(`(()=>{ const c=__hc.itemClasses(); return c.syringe||'stim_syringe'; })()`);
    console.log('  the game names the syringe item: '+JSON.stringify(id));

    // HELD, close to the camera so the barrel graduations are at their largest.
    const held=await page.evaluate('__hc.hold('+JSON.stringify(id)+')');
    console.log('  held: '+JSON.stringify(held));
    await sleep(1400);
    await page.screenshot({path:path.join(OUT,'syringe-held.png')});

    // The ICON is a 3D snapshot of the same model; the hotbar is in every frame, so a crop of the first slot is the icon.
    await page.screenshot({path:path.join(OUT,'syringe-icon.png'), clip:{x:300,y:560,width:120,height:70}});

    // OFFHAND, where a long thin item can be scaled to a sliver.
    await page.evaluate('__hc.offhandSet('+JSON.stringify(id)+')'); await sleep(1300);
    const off=await page.evaluate('__hc.offhandUse()');
    console.log('  offhand: '+JSON.stringify(off));
    await page.screenshot({path:path.join(OUT,'syringe-offhand.png')});

    console.log('  frames: bench/results/syringe-held.png, syringe-icon.png, syringe-offhand.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
