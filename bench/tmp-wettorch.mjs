// THE TORCH IN THE WATER. Ben: "delete the random torch in the water outside of spawn under the water."
//
// It is visible in bench/results/nightvol-forest.png, burning under the surface off the beach. Deleting the one instance is
// not the fix -- it comes back on a fresh world -- so this finds WHERE it is, in world coordinates, and what is around it,
// which is what names the code that placed it. __hc.blockAt reads the world one cell at a time; the sweep is coarse in x/z
// and only looks at and below sea level, because that is the whole complaint.
//
// usage: node bench/tmp-wettorch.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=12', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(8000);

    const found = await page.evaluate(`(()=>{ const p=__hc.probe(), sea=p.sea;
      const T=[], names={};
      // Every torch anywhere near spawn, with the block under it and whether it is at or below the waterline.
      for(let x=Math.round(p.x)-90; x<=Math.round(p.x)+90; x++)
        for(let z=Math.round(p.z)-90; z<=Math.round(p.z)+90; z++)
          for(let y=Math.max(1,sea-14); y<=sea+3; y++){
            const b=__hc.blockAt(x,y,z);
            if(b===__hc.bid('torch') || b===__hc.bid('torch_unlit')){
              T.push({x,y,z, lit:b===__hc.bid('torch'), under:__hc.blockAt(x,y-1,z), around:[
                __hc.blockAt(x+1,y,z),__hc.blockAt(x-1,y,z),__hc.blockAt(x,y,z+1),__hc.blockAt(x,y,z-1),__hc.blockAt(x,y+1,z)],
                belowSea:y<=sea });
            }
          }
      // WET means water actually touches it, which is the complaint; below-sea-level but sealed in rock is just a mine.
      const W=__hc.bid('water');
      for(const t of T) t.wet = t.around.indexOf(W)>=0;
      return { spawn:[Math.round(p.x),Math.round(p.z)], sea, wet:T.filter(t=>t.wet), belowSea:T.filter(t=>t.belowSea).length, n:T.length }; })()`).catch(e=>({err:String(e.message||e)}));
    console.log(JSON.stringify(found,null,1).slice(0,2000));
    console.log('  torches with water touching them: '+((found.wet||[]).length)+'   (0 is the pass)');
    // AND THE MINE MUST STILL EXIST. Removing the torch by removing the mine would also read as a pass here.
    const mine = await page.evaluate(`(()=>{ const p=__hc.probe(); const hits=[];
      for(let x=Math.round(p.x)-120;x<=Math.round(p.x)+120;x+=1) for(let z=Math.round(p.z)-120;z<=Math.round(p.z)+120;z+=1){
        if(__hc.blockAt(x,__hc.surfH(x,z)-6,z)===__hc.bid('torch')) hits.push([x,z]); }
      return { deepTorches:hits.length, sample:hits.slice(0,4) }; })()`).catch(e=>({err:String(e)}));
    console.log('  a mine still exists underground nearby: '+JSON.stringify(mine));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
