// THE BACKROOMS DISTRICTS, SAMPLED. Ben: "invisible blocks cover the entire inside of the backrooms" and "lighting is not showing
// from the ceiling". Both are claims about places, and until __hcBR.roomAt/roomPick existed there was no way to say which place:
// __hcBR.state().zone is the ATMOSPHERE zone and updateS pins it to 0 every frame, so earlier samples thousands of blocks apart
// all reported zone 0 and meant nothing.
//
// For each district: stand in the biggest room of it, read the room, and read the VOXEL column -- floor, ceiling, and how much of
// the space between them is solid. brLightCell lights 0.82 / 0.55 / 0.12 of cells in zones 0 / 1 / 3, so a dark ceiling in zone 3
// is the design rather than a defect, and this is the reading that tells those apart.
//
// usage: node bench/tmp-br-zones.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:/code/Minecraft';
const freePort = () => new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp = (u) => new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const findBrowser = () => ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return null; } })()');
    await sleep(6500);

    console.log('  census: '+JSON.stringify(await page.evaluate('__hcBR.roomCensus()')));
    console.log('  standing in: '+JSON.stringify(await page.evaluate('__hcBR.roomAt()')));

    for(const z of [0,1,2,3]){
      const pick=await page.evaluate('__hcBR.roomPick('+z+',true)');
      if(!pick || pick.err){ console.log('  district '+z+': '+JSON.stringify(pick)); continue; }
      // tpExact takes (x, z, y). The player's own y is kept: which storey a room sits on is not knowable from here, and the voxel
      // read reports the floor and ceiling it actually finds, so a wrong storey shows up as "no floor found" rather than as a lie.
      await page.evaluate('(()=>{ const q=__hc.probe(); __hc.tpExact('+pick.x+','+pick.z+', q.y); })()');
      await sleep(3800);
      const room=await page.evaluate('__hcBR.roomAt()');
      const vox=await page.evaluate(`(()=>{ const q=__hc.probe(), bx=Math.round(q.x), by=Math.round(q.y), bz=Math.round(q.z);
        let floorY=null, ceilY=null, solid=0, air=0;
        for(let dy=-4; dy<=16; dy++){ let s=0;
          for(let dx=-5; dx<=5; dx++) for(let dz=-5; dz<=5; dz++) if(__hc.blockAt(bx+dx,by+dy,bz+dz)!==0) s++;
          if(dy<0 && s>100 && floorY===null) floorY=dy;
          if(dy>0 && s>100 && ceilY===null) ceilY=dy;
          if(dy>=0 && (ceilY===null || dy<ceilY)){ solid+=s; air+=121-s; } }
        return { y:by, floorY, ceilY, solidInVoid:solid, air }; })()`);
      console.log('  district '+z+': picked '+JSON.stringify(pick));
      console.log('              standing in '+JSON.stringify(room&&{zone:room.zone,lit:room.lit,cells:room.cells,w:room.w,d:room.d}));
      console.log('              voxels '+JSON.stringify(vox));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
