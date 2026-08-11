// WHICH TEXTURE DO A FENCE, A DOOR AND A TRAPDOOR ACTUALLY CARRY? Ben, 08-11: "fences, doors, trapdoors, all lost their
// texture." A flat-tinted model and a textured one are the same silhouette in a screenshot, so this asks the scene graph.
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
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await sleep(3500);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    const laid=await page.evaluate(`(()=>{
      const p=__hc.pos(), x0=Math.floor(p.x)+3, z0=Math.floor(p.z)+3, gy=Math.floor(__hc.groundY(x0+0.5,z0+0.5));
      const put=(dx,dz,name)=>__hc.setBlockAt(x0+dx,gy,z0+dz,name);
      return { y:gy, x0, z0, fence:put(0,0,'fence'), door:put(2,0,'door'), trapdoor:put(4,0,'trapdoor'),
               ladder:put(0,2,'ladder'), gate:put(2,2,'gate'), planks:put(4,2,'planks') }; })()`);
    console.log('laid', JSON.stringify(laid));
    await sleep(2500);
    const mats=await page.evaluate('__hc.placedMats(null,true)');
    console.log('err', JSON.stringify(mats.err||null), 'n', (mats.parts||[]).length);
    // the terrain chunk meshes are all white with no named map; only the MODEL materials are the question here
    fs.writeFileSync(path.join(OUT,'wood-maps.json'), JSON.stringify(mats.parts||[],null,0));
    // THE COPY IN YOUR HAND, which is the one that was flat: hotbar icon, inventory icon, dropped item and both hands
    // are all itemModel(), so one probe covers every place a fence is drawn other than in the ground.
    for(const id of ['fence','door','trapdoor','ladder','gate','chest'])
      console.log('held', id, JSON.stringify(await page.evaluate(`__hc.itemModelMats(${JSON.stringify(id)})`)));
    const tally={}; for(const p of (mats.parts||[])){ const k=p.col+' '+p.mapName; tally[k]=(tally[k]||0)+1; }
    for(const k of Object.keys(tally)) if(k.indexOf('#ffffff')!==0) console.log('  ', k, 'x'+tally[k]);
    // AND WHAT DOES IT LOOK LIKE? The map is provably there (above), so "lost their texture" has to be judged as pixels:
    // one close frame per prop, eye height, from two cells away.
    for(const [nm,dx,dz] of [['fence',0,0],['door',2,0],['trapdoor',4,0],['ladder',0,2]]){
      // AIM WITH cam(), NOT look(). look() wants a world point and computes the angles itself, but it returned without
      // moving the camera here — four identical frames, which is how a silent aim failure looks. cam() sets yaw/pitch
      // directly, so the angles are computed here and the frame is provably pointed at the cell.
      const aim=await page.evaluate(`(()=>{ const L=${JSON.stringify(laid)}, p=__hc.pos();
        const tx=L.x0+${dx}+0.5, ty=L.y+0.5, tz=L.z0+${dz}+0.5;
        const ddx=tx-p.x, ddy=ty-(p.y+1.6), ddz=tz-p.z, len=Math.hypot(ddx,ddy,ddz)||1;
        return Object.assign(__hc.cam({yaw:Math.atan2(-ddx,-ddz), pitch:Math.asin(ddy/len)}), {dist:+len.toFixed(1)}); })()`);
      console.log('aim',nm,JSON.stringify(aim));
      await sleep(700);
      await page.screenshot({path:path.join(OUT,'wood-'+nm+'.png')}); }
    await page.screenshot({path:path.join(OUT,'wood-maps.png')});
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})();
