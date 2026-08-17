// WHY IS THE GUN VERTICAL. Ben's frame shows the revolver muzzle-up on the end of a pale forearm, in the open, on a
// beach. The block-out probe tilts a held item by BLOCKOUT_TILT (1.75 rad, 100 degrees) when a wall is within a metre,
// which is exactly what a muzzle-up revolver looks like — so the first question is whether the probe is firing where
// there is no wall. __hc.blockOut() answers it: bend is the eased signal, tiltRx the rotation actually on the group.
// Shot in the open at noon, then again facing the sea, then with a torch, because the torch is vertical in his frames too.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(16000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.25)');
    await page.evaluate('__hc.cmdRun("/give @me revolver 1")');
    await page.evaluate('__hc.cmdRun("/give @me torch 1")');
    await sleep(2500);
    const shoot=async(tag,pre)=>{
      if(pre) await page.evaluate(pre).catch(e=>console.log('  pre failed',String(e).slice(0,140)));
      await sleep(2500);
      await page.screenshot({path:path.join(OUT,'vert-'+tag+'.png')});
      const b=await page.evaluate('JSON.stringify((()=>{const o=__hc.blockOut(); return {id:o.id,bend:o.bend,out:o.out,tiltRx:o.tiltRx,tip:o.tip&&o.tip.rx};})())').catch(e=>String(e).slice(0,120));
      console.log('== '+tag+'  '+b);
    };
    await shoot('revolver-sea','__hc.sel(0)');
    await shoot('revolver-inland','__hcBR.look(2.2,-0.05)');
    await shoot('torch-sea','(__hc.sel(1), __hcBR.look(0.6,-0.06))');
    // BUILD THE WALL THE PROBE IS LOOKING FOR. If a block-out looks like Ben's frame, the tilt is the fault and no
    // amount of hunting for where he was standing is needed; if it does not, the vertical hold is something else.
    await shoot('revolver-wall','(()=>{__hc.sel(0); const o=[]; for(let dy=0;dy<3;dy++) for(let dx=-2;dx<=2;dx++) o.push(__hc.setBlock(dx,dy,-1,"cobble")); return o.length;})()');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
