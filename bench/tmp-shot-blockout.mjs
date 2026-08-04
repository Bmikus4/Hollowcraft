// Photograph the block-out pose. The numbers say the muzzle is out of the wall; only a frame says whether what you are
// holding still reads as a gun in a hand. Writes bench/results/blockout-<id>-<state>.png.
//   node bench/tmp-shot-blockout.mjs [ids]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const IDS=(process.argv[2]||'hunting_rifle,shotgun,minigun,wood_pickaxe').split(',');
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    await page.evaluate('__hc.cam({yaw:0,pitch:0})');
    const P0=await page.evaluate('__hc.pos()');
    const wallZ=Math.floor(P0.z)-2;
    // A LOW wall on purpose: pressed against a tall one the whole frame is unlit stone and a dark gun on a dark wall reads as
    // nothing at all — which is indistinguishable in a screenshot from a gun that has left the screen. Two blocks still trips
    // the probe (it samples eye-0.55) and puts sky behind the viewmodel, so its silhouette is legible.
    // A NARROW PILLAR, not a wall, and the camera tipped up: pressed against a tall wall the whole frame is unlit stone, and a
    // dark gun on a dark wall is indistinguishable in a photograph from a gun that has left the screen. This trips the same
    // probe and leaves sky behind the viewmodel, so its silhouette is legible — which is the only thing the photo is for.
    await page.evaluate(`(()=>{ for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=2;dy++) __hc.setBlock(dx,dy,-2,'stone'); })()`);
    await sleep(1200);
    const out={};
    for(const id of IDS){
      await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${id} 1")`); await sleep(250);
      await page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(300);
      for(const [state,gap] of [['open',2.2],['wall',0.45]]){
        await page.evaluate(`__hc.tpAt(${Math.floor(P0.x)+0.5},${P0.y},${wallZ+1+gap})`);
        await page.evaluate('__hc.cam({yaw:0,pitch:-0.35})'); await sleep(1000);
        out[id+'/'+state]=await page.evaluate('(()=>{ const b=__hc.blockOut(); return {bend:b.bend,rx:b.tiltRx,tipFwd:b.tip&&b.tip.fwd,inBlock:b.tip&&b.tip.inBlock}; })()');
        await page.screenshot({path:path.join(ROOT,'bench','results','blockout-'+id+'-'+state+'.png')});
      }
    }
    console.log(JSON.stringify(out,null,1));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
