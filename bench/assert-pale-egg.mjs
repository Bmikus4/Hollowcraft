// THE PALE SPAWN EGG IN THE OVERWORLD. Ben: "pale spawn egg broken in the overworld."
//
// The code's intent is deliberate and dated: out here the egg does not spawn the Pale, it opens a Void Door, "because the
// Pale only exists in the halls" (index.html:15959, Ben 07-27). So "broken" is one of two different things needing different
// answers: either that door path fails and nothing happens at all, or it works and the design is what he objects to.
//
// spawnFromEgg is the single chokepoint the right-click handler calls, and /spawn calls the same function, so driving it
// through the console tests the real path without having to find which hotbar slot the egg landed in.
//
// usage: node bench/assert-pale-egg.mjs
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

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(50)+' got='+JSON.stringify(got).slice(0,240)); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1000,height:600} })).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // ITEMS and BR are BOTH module-scoped: a first version of this file tested `typeof ITEMS!=='undefined'` and reported
    // that the build has no pale egg, and read BR.door as null after a door had opened. Every reading here goes through a
    // hook. /give answers with near matches for a bad name, which is how the item id is confirmed rather than assumed.
    const give = await page.evaluate(`__hc.cmdRun("/give egg_pale 1")`);
    console.log('  /give egg_pale says: '+JSON.stringify(give.out||give).slice(0,200));

    const state=()=>page.evaluate(`(()=>{ const d=(typeof __hcBR!=='undefined'&&__hcBR.doorAt)?__hcBR.doorAt():'no doorAt hook';
      return { door:d }; })()`).catch(e=>({err:String(e)}));

    const pale=()=>page.evaluate(`(()=>{ const s=(typeof __hcBR!=='undefined'&&__hcBR.paleState)?__hcBR.paleState():null;
      return s; })()`).catch(e=>({err:String(e)}));

    let s=await state();
    ok('no Void Door before the egg is used', s.door===null, s);
    ok('no Pale before the egg is used', !(await pale()), await pale());

    const out = await page.evaluate(`__hc.cmdRun("/spawn pale 1")`);
    console.log('  /spawn pale (same spawnFromEgg the egg calls): '+JSON.stringify(out).slice(0,200));
    await sleep(2500);

    const p1=await pale();
    console.log('  the Pale, just spawned: '+JSON.stringify(p1).slice(0,300));
    ok('the egg spawned the Pale, out in the overworld', !!p1 && p1.state!=='dormant', p1);
    ok('it did NOT open a Void Door instead', (await state()).door===null, (await state()).door);

    // ON THE GROUND, not at a Backrooms storey height. This is the failure the old floor lookup would produce out here.
    const ground=await page.evaluate(`(()=>({ terrain:__hc.surfH(Math.round(`+(p1&&p1.x||0)+`),Math.round(`+(p1&&p1.z||0)+`)) }))()`);
    ok('it stands on the terrain, not far under it', p1 && Math.abs(p1.y-ground.terrain)<6, {paleY:p1&&p1.y, terrain:ground.terrain});

    // ---- THE CHASE AND THE KILL FIRST, BEFORE ANYONE LOOKS AT IT. Staring at the Pale for 5.2 seconds makes it withdraw,
    // by design, and a sweep that hunts for it on screen stares at it for about that long -- so photographing it first
    // ended the encounter and made the chase and the kill both read as failures. Photograph a SECOND one afterwards.
    await page.evaluate('__hcBR.look('+(Math.PI)+',0)'); await sleep(400);
    { const before=await pale();
      await sleep(6000);
      const after=await pale();
      const moved = (before&&after) ? Math.hypot(after.x-before.x, after.z-before.z) : 0;
      ok('it hunts: it moved while unobserved', moved>0.5, {moved:+moved.toFixed(2), before:before&&[before.x,before.z], after:after&&[after.x,after.z]}); }

    // AND IT KILLS. brKill returned early whenever the player was not inside the halls, so out here its lunge could repeat
    // forever against a player it could never touch. Keep looking away and let it close the last blocks.
    { let dead=null;
      for(let i=0;i<12 && !dead;i++){ await sleep(1200);
        dead=await page.evaluate(`(()=>{ const s=__hc.st(); return (s.dead===true||s.hp<=0)?{dead:s.dead,hp:s.hp}:null; })()`).catch(()=>null); }
      const last=await page.evaluate(`(()=>{ const s=__hc.st(), p=(__hcBR.paleState&&__hcBR.paleState())||{}; return {hp:s.hp,dead:s.dead,paleDist:p.dist,paleState:p.state,phase:p.phase}; })()`);
      ok('reaching you kills you', !!dead, dead||last); }
    ok('no page errors', errs.length===0, errs.slice(0,3));

    // ---- NOW LOOK AT ONE. Every number above can pass with an invisible, buried or wrongly-scaled mesh, so respawn and aim
    // the camera at where the game says it is -- by projection feedback, not by guessing a yaw -- and save the frame.
    await page.evaluate('__hc.cmdRun("/heal")').catch(()=>{});
    await page.evaluate('__hc.cmdRun("/spawn pale 1")');
    await sleep(1500);
    { const p0=await pale();
      const aimed = await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
        let best=null;
        for(let i=0;i<48;i++){ const yaw=i/48*Math.PI*2; __hcBR.look(yaw,-0.02); await f(); await f();
          const s=__hc.screenOf(`+(p0&&p0.x||0)+`, `+((p0&&p0.y||0)+1.2)+`, `+(p0&&p0.z||0)+`);
          if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),off:+off.toFixed(0),px:+s.px.toFixed(0),py:+s.py.toFixed(0)}; } }
        if(best){ __hcBR.look(best.yaw,-0.02); await f(); await f(); }
        return best; })()`);
      console.log('  camera aimed at the Pale: '+JSON.stringify(aimed));
      ok('the Pale is somewhere the camera can see', !!aimed, aimed);
      await sleep(1000);
      await page.screenshot({path:path.join(ROOT,'bench','results','pale-egg.png')}); }
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
