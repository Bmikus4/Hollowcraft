// ARE THERE INVISIBLE BLOCKS INSIDE THE BACKROOMS? Ben: "invisible blocks cover the entire inside of the backrooms (maybe why
// portal is spawning on the roof)".
//
// tmp-br-visible.mjs already proves the Backrooms RENDER: 503 meshes, none hidden, 33k triangles, fixtures lighting. That is the
// environment group -- the Backrooms are built as MESHES, not out of the world's voxels. Which leaves the obvious question nobody
// has asked: what is in the VOXEL GRID at those coordinates? If the interior cells are solid blocks that nothing draws, then the
// halls you walk through are meshes floating inside a solid volume, "invisible blocks cover the entire inside" is literally true,
// and anything that sites itself by finding the first solid surface from above -- a portal, say -- lands on that volume's ROOF.
//
// So this samples the grid the player is standing in and reports it as a vertical profile: for each y, how many of the sampled
// columns are solid. A hall reads as air at head height. A solid volume reads as solid everywhere.
//
// usage: node bench/tmp-br-invisible.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:900,height:560}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    console.log('  enter: '+JSON.stringify(await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return {err:String(e.message||e)}; } })()')));
    await sleep(6000);
    const st=await page.evaluate('(()=>{ const p=__hc.probe(); return {x:p.x,y:p.y,z:p.z, inside:(__hcBR.state?__hcBR.state():null)}; })()').catch(()=>null);
    console.log('  standing at: '+JSON.stringify(st).slice(0,220));

    // FOUR PLACES, not one. His report is "the entire inside", and a single sample in zone 0 by the entry cannot speak for it.
    // The maze runs along x from about 100000, and zone drives the lighting density (brLightCell), so it is read back at each stop
    // rather than assumed from the distance travelled.
    for(const [ox,oz] of [[0,0],[240,90],[760,-320],[1900,880]]){
      // tpExact takes (x, z, y) -- NOT (x, y, z). Passing them in the natural order sent the camera to z=90 and y=41+, which
      // teleported it inside solid concrete and, on the last stop, clean out of the maze (inside=false) -- and the sample then
      // reported 225 solid cells "in the void", which reads exactly like the bug being looked for. The first run of this loop
      // produced three rows of that and one valid row.
      if(ox||oz){ await page.evaluate('(()=>{ const p=__hc.probe(); __hc.tpExact(p.x+'+ox+', p.z+'+oz+', p.y); })()'); await sleep(5000); }
      const zs=await page.evaluate('(()=>{ const s=__hcBR.state?__hcBR.state():null; const p=__hc.probe(); return {zone:s&&s.zone, inside:s&&s.inside, x:Math.round(p.x), y:Math.round(p.y), z:Math.round(p.z)}; })()');
      const r=await page.evaluate(`(()=>{ const p=__hc.probe(), bx=Math.round(p.x), by=Math.round(p.y), bz=Math.round(p.z);
        let floorY=null, ceilY=null, solidMid=0, air=0, ids={};
        for(let dy=-3; dy<=14; dy++){ let s=0;
          for(let dx=-7; dx<=7; dx++) for(let dz=-7; dz<=7; dz++){ const b=__hc.blockAt(bx+dx,by+dy,bz+dz);
            if(b!==0){ s++; ids[b]=(ids[b]||0)+1; } }
          if(dy<0 && s>200 && floorY===null) floorY=dy;
          if(dy>0 && s>200 && ceilY===null) ceilY=dy;
          if(dy>=0 && (ceilY===null||dy<ceilY)){ solidMid+=s; air+=225-s; } }
        return { floorY, ceilY, solidMid, air, ids:Object.keys(ids).length }; })()`);
      console.log('  zone '+JSON.stringify(zs.zone)+' at '+[zs.x,zs.y,zs.z].join(',')+' inside='+zs.inside
        +'   floor at y'+r.floorY+', ceiling at y+'+r.ceilY+',  solid cells in the void: '+r.solidMid+'  (air '+r.air+')');
    }

    const prof=await page.evaluate(`(()=>{ const p=__hc.probe(), bx=Math.round(p.x), by=Math.round(p.y), bz=Math.round(p.z);
      const rows=[], names={};
      for(let dy=-3; dy<=8; dy++){ let solid=0, air=0, ids={};
        for(let dx=-7; dx<=7; dx++) for(let dz=-7; dz<=7; dz++){
          const b=__hc.blockAt(bx+dx, by+dy, bz+dz);
          if(b===0) air++; else { solid++; ids[b]=(ids[b]||0)+1; } }
        rows.push({dy, solid, air, ids}); }
      // Name the ids that turned up, so "solid" can be attributed to a block rather than left as a number.
      const all={}; rows.forEach(r=>{ for(const k in r.ids) all[k]=(all[k]||0)+r.ids[k]; });
      const bidNames=__hc.bid(); const idToName={};
      for(const n of bidNames){ const v=__hc.bid(n); if(all[v]) idToName[v]=n; }
      return { at:[bx,by,bz], rows, idToName }; })()`);
    console.log('  ids present: '+JSON.stringify(prof.idToName));
    console.log('  vertical profile of the 15x15 columns around the player (225 cells per row):');
    for(const r of prof.rows) console.log('     y'+(r.dy>=0?'+':'')+r.dy+'   solid '+String(r.solid).padStart(3)+'   air '+String(r.air).padStart(3)
      +'   '+Object.keys(r.ids).map(k=>(prof.idToName[k]||k)+'x'+r.ids[k]).join(' '));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
