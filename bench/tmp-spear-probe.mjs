// DO SPEARS DAMAGE THE WRETCH? Measured, not reasoned about. Throws at a summoned Wretch from several ranges and heights
// and reports hp before/after each throw plus where the spear ended up, so a miss can be told from a hit that does nothing.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:120000 });
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true); __hc.setTime(0.72)`);
    await sleep(1500);
    console.log('summon', JSON.stringify(await page.evaluate(`__hc.summonNow()`)));
    await page.waitForFunction(`(()=>{try{return __hc.st().wa===true;}catch(e){return false;}})()`, { timeout:30000 });

    // Park it: freeze the AI is not available for the primary, so instead sample fast and accept it is moving. Distance and
    // aim are re-read immediately before every throw for that reason.
    for(let k=0;k<10;k++){
      const r = await page.evaluate(`(()=>{
        const before = { hp:wretch.hp, dist:+(wretch.dist||0).toFixed(2), state:wretch.state,
                         wy:+wretch.pos.y.toFixed(2), eye:+(player.pos.y+ (typeof EYE!=='undefined'?EYE:1.62)).toFixed(2),
                         scaleY:wretch.group?+wretch.group.scale.y.toFixed(3):null, crawl:+(wretch.crawl||0).toFixed(2) };
        // aim at mid-body: lookDir is (-sin yaw,_,-cos yaw); pitch so the ray passes through wretch.pos.y + h*0.45
        const dx=wretch.pos.x-player.pos.x, dz=wretch.pos.z-player.pos.z, hd=Math.hypot(dx,dz);
        const box=new THREE.Box3().setFromObject(wretch.group), h=box.max.y-box.min.y;
        const aimY=wretch.pos.y + h*0.45, dy=aimY-(player.pos.y+(typeof EYE!=='undefined'?EYE:1.62));
        player.yaw=Math.atan2(-dx,-dz); player.pitch=Math.atan2(dy,hd);
        const t=__hc.spearTest();
        return { before, h:+h.toFixed(2), aimY:+aimY.toFixed(2), pitch:+player.pitch.toFixed(3), throwRes:t };
      })()`);
      await sleep(1400);
      const after = await page.evaluate(`(()=>({ hp:wretch.hp, everHurt:!!wretch.everHurt, encDmg:+(wretch.encDmg||0).toFixed(1),
        flying:spears.length, stuck:stuckSpears.length, riding:stuckSpears.filter(s=>s.onWretch).length,
        lastStuck:stuckSpears.length?{x:+stuckSpears[stuckSpears.length-1].x.toFixed(1),y:+stuckSpears[stuckSpears.length-1].y.toFixed(1),z:+stuckSpears[stuckSpears.length-1].z.toFixed(1),onW:!!stuckSpears[stuckSpears.length-1].onWretch}:null }))()`);
      console.log('throw '+k, JSON.stringify({ dist:r.before.dist, state:r.before.state, wretchH:r.h, aimY:r.aimY,
        hpBefore:r.before.hp, hpAfter:after.hp, hurt:after.everHurt, encDmg:after.encDmg, riding:after.riding, lastStuck:after.lastStuck }));
      if(after.hp!=null && r.before.hp!=null && after.hp < r.before.hp) console.log('   -> DAMAGE LANDED');
      await sleep(400);
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
