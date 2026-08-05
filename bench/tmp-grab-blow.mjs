// A BLOW STRUCK WHILE GRIPPED must land and fail. Three claims, each on state this check set itself:
//   particles spawn, hp does not move, the creature is not knocked back.
// A control swing at range is taken first, so "no damage" cannot pass merely because swings never connect at all.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT='D:\\code\\Minecraft';
const OUT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f17fe305-bd3b-4b89-81c6-34ea30e4177c/scratchpad';
fs.mkdirSync(OUT,{recursive:true});
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const fails=[];
const check=(n,ok,d)=>{ console.log((ok?'PASS  ':'FAIL  ')+n+(d!=null?'   '+JSON.stringify(d):'')); if(!ok)fails.push(n); };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[];
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR: '+String(e.message||e).slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true); __hc.setTime(0.72)`);
    await sleep(1500);

    // CONTROL: a swing that connects normally. Without this, "hp did not move" during the grab could just mean melee never
    // reaches the creature at all, and the check would pass with the feature deleted.
    await page.evaluate(`__hc.hwHold(true)`);
    await page.evaluate(`__hc.hw(12)`);                            // spawnHorrific clamps to >=10 blocks, so asking for 3 gets 10
    await sleep(1200);
    // Walk the PLAYER into melee reach instead. Asking for a 3-block spawn silently produced a 10-block one and the control
    // swing connected with nothing — which would have let "no damage while gripped" pass with the feature deleted.
    await page.evaluate(`(()=>{ const w=__hc.hwState()[0]; __hc.tp(w.x+1.6, w.y+1, w.z); })()`);
    await sleep(900);
    await page.evaluate(`(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      __hc.cam({ yaw:Math.atan2(-(w.x-p.x), -(w.z-p.z)), pitch:-0.05 }); })()`);
    await sleep(300);
    console.log('control range', JSON.stringify(await page.evaluate(`(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      return { d:+Math.hypot(w.x-p.x, w.z-p.z).toFixed(2), reachIs:3.6 }; })()`)));
    const ctrl = await page.evaluate(`__hc.swing()`);
    console.log('control swing (not gripped)', JSON.stringify(ctrl));
    check('a swing at range does damage it', ctrl.dragging===false && ctrl.hp.after!=null && ctrl.hp.after < 2700, ctrl.hp);
    check('the control swing did NOT take the failed-blow path', ctrl.blowFailed===false, ctrl.blowFailed);

    // Now let it take the player. Fresh instance: the control hit above counts toward the 100-damage rout threshold.
    await page.evaluate(`__hc.hwKill()`);
    await sleep(400);
    await page.evaluate(`__hc.hwHold(true)`);
    await page.evaluate(`__hc.hw(7)`);
    await sleep(400);
    await page.evaluate(`__hc.hwHold(false)`);
    // Poll FAST and pin the jumpscare the moment it appears: 'jumpscare' is the first grab phase, over in well under a
    // second, so a 600ms poll only ever sees 'haul' and the scare looks like it never happens.
    let gripped=false, scared=null;
    for(let k=0;k<200;k++){ const w=(await page.evaluate(`__hc.hwState()`))[0];
      if(w && (w.gp==='jumpscare'||w.gp==='devour')){ scared=w.gp;
        await page.evaluate(`window.__scareHold=0.55`);                     // the game's own frame-pin, put there for this
        await sleep(500);
        console.log('during scare  '+JSON.stringify((await page.evaluate(`__hc.hwState()`))[0]));
        await page.screenshot({ path: path.join(OUT,'hw-jumpscare.png') });
        await page.screenshot({ path: path.join(OUT,'hw-jumpscare-crop.png'), clip:{x:340,y:60,width:600,height:600} });
        await page.evaluate(`window.__scareHold=null`); }
      if(w && w.dragging){ gripped=true; if(scared) break; }
      if(gripped && k>60) break;
      await sleep(150); }
    check('it takes hold of the player', gripped);
    check('the jumpscare fires and renders', !!scared, scared);
    if(gripped){
      await page.screenshot({ path: path.join(OUT,'grab-blow-before.png') });
      // It must still be DRAWN while it drags you. Parking on player.grabbed made the whole capture invisible, so assert the
      // loop keeps stepping — a parked subject stops advancing its step counter.
      const d1=(await page.evaluate(`__hc.hwState()`))[0].drift.steps;
      await sleep(1100);
      const d2=(await page.evaluate(`__hc.hwState()`))[0].drift.steps;
      check('it is still rendered while dragging you', d2>d1, {gp:(await page.evaluate(`__hc.hwState()`))[0].gp, steps:d1+'->'+d2});

      // Several swings: mid-grab the cutscene owns the camera, so the facing test may reject a given swing.
      let landed=0, dmg=0, moved=0, parts=0;
      for(let t=0;t<6;t++){
        const r = await page.evaluate(`__hc.swing()`);
        if(r.err){ console.log('  swing error', r.err); break; }
        if(r.blowFailed){ landed++; parts += r.particlesSpawned; moved = Math.max(moved, r.moved);
          const a=(r.hp.after==null?2700:r.hp.after), b=(r.hp.before==null?2700:r.hp.before); dmg += (b-a); }
        console.log('  swing '+t, JSON.stringify(r));
        await sleep(500);
      }
      await page.screenshot({ path: path.join(OUT,'grab-blow-after.png') });
      check('the blow LANDS while gripped', landed>0, {swingsThatLanded:landed+'/6'});
      check('it spawns impact particles', parts>0, {particles:parts});
      check('it applies NO damage', dmg===0, {damage:dmg});
      check('it applies NO knockback', moved<0.01, {moved});
    }
    // ---- THE DUNGEON-SACRIFICE TRIGGER, through the same function endDrag calls. Also that it cannot stack: a second
    // sacrifice while one is alive must produce nothing, because the escape paths can call endDrag twice.
    await page.evaluate(`__hc.hwKill()`); await sleep(400);
    const s1 = await page.evaluate(`__hc.hwSacrifice()`);
    console.log('sacrifice #1', JSON.stringify(s1));
    check('a dungeon sacrifice spawns one', s1.spawned===true && s1.activeAfter===1, s1);
    const s2 = await page.evaluate(`__hc.hwSacrifice()`);
    console.log('sacrifice #2', JSON.stringify(s2));
    check('a second sacrifice cannot stack them', s2.spawned===false && s2.activeAfter===1, s2);

    check('no page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fails.length?('FAILED: '+fails.join(', ')):'ALL PASS');
  process.exit(fails.length?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
