// THE ASYNC LAB CARD DOES NOT PUT THE PORTAL ON THE ROOF.
//
// Ben reported it twice. It was fixed once, in brSpawnDoorNearPlayer, whose comment says so -- and the bug survived, because the
// EGG sites through a different function. brSpawnDoorFromEgg anchored on the CLICKED block: by = groundYAt(hit.x, hit.z, hit.y+3).
// brSlabColumn lays a solid br_ceiling lid at floor+BR_CH, so clicking the ceiling starts that scan above the lid and it settles on
// the lid's top surface. A portal on the roof.
//
// The check drives the real siting function with a synthetic hit on the ceiling -- the worst case, and the one a player produces by
// looking up when they use the card -- and requires the door to land on the player's own storey instead. The proven-failing control
// is the arithmetic of the old behaviour: the same hit under the old rule would site at least BR_CH above the floor, so the check
// also asserts the door is nowhere near there.
//
// usage: node bench/assert-br-egg-portal.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:800,height:520}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return null; } })()');
    await sleep(6500);
    ok('the player is inside the Backrooms', (await page.evaluate('(()=>{ const s=__hcBR.state?__hcBR.state():null; return !!(s&&s.inside); })()'))===true);

    // Find this column's floor and its ceiling from the voxels, so the test does not assume BR_FLOOR or BR_CH.
    const col=await page.evaluate(`(()=>{ const p=__hc.probe(), bx=Math.round(p.x), bz=Math.round(p.z), by=Math.round(p.y);
      let floorY=null, ceilY=null;
      for(let y=by; y>by-12; y--) if(__hc.blockAt(bx,y,bz)!==0){ floorY=y; break; }
      for(let y=by; y<by+20; y++) if(__hc.blockAt(bx,y,bz)!==0){ ceilY=y; break; }
      return { bx, bz, by, floorY, ceilY }; })()`);
    console.log('  column: '+JSON.stringify(col));
    ok('the column has a floor and a ceiling to test between', col.floorY!=null && col.ceilY!=null && col.ceilY>col.floorY+2, col);

    // THE WORST CASE: the card used with the crosshair on the CEILING.
    const d=await page.evaluate('__hcBR.eggDoorAt('+col.bx+','+col.ceilY+','+col.bz+')');
    console.log('  door from a ceiling hit: '+JSON.stringify(d));
    ok('the portal did not land on the roof', d && d.y < col.ceilY, {doorY:d&&d.y, ceilY:col.ceilY});
    ok('it landed on the player\'s own storey', d && Math.abs(d.y-d.playerFloor)<2.5, {doorY:d&&d.y, playerFloor:d&&d.playerFloor});

    // And a FLOOR hit must still work, so the fix has not simply pinned the door to one place.
    const d2=await page.evaluate('__hcBR.eggDoorAt('+col.bx+','+col.floorY+','+col.bz+')');
    console.log('  door from a floor hit:   '+JSON.stringify(d2));
    ok('a floor hit also lands on the storey', d2 && d2.y < col.ceilY && Math.abs(d2.y-d2.playerFloor)<2.5, {doorY:d2&&d2.y, playerFloor:d2&&d2.playerFloor});

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
