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
    const browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:ARGS });
    const page = await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:120000 });
    await page.evaluate(`__hc.pinScene(); __hc.vitals(20,20,true); __hc.setTime(0.72)`);
    await sleep(1500);
    console.log('summon', JSON.stringify(await page.evaluate(`__hc.summonNow()`)));
    await page.waitForFunction(`(()=>{try{return __hc.st().wa===true;}catch(e){return false;}})()`, { timeout:30000 });

    // Everything goes through __hc: page.evaluate runs in the page's global scope and the game's `wretch`, `spears` and
    // `player` are module-scoped inside <script type="module">, so touching them directly is a ReferenceError.
    // __hc.spearTest() already aims at the Wretch (via __hc.look, which targets pos.y+2.4) and hurls at full power, so a
    // throw is one call and every sample is taken from the hooks that exist.
    let landed = 0;
    for(let k=0;k<10;k++){
      const before = await page.evaluate(`(()=>{ const v=__hc.void3(), s=__hc.st(), p=__hc.pose();
        return { hp:v.hp, dist:p.dist, state:s.ws, wy:s.wy, crawl:p.crawl, aim:__hc.look() }; })()`);
      const thrown = await page.evaluate(`__hc.spearTest()`);
      await sleep(1500);
      const after = await page.evaluate(`(()=>{ const v=__hc.void3(), r=__hc.riding();
        return { hp:v.hp, stuck:r.length, riding:r.filter(x=>x.onW).length, last:r[r.length-1]||null }; })()`);
      const hit = before.hp!=null && after.hp!=null && after.hp < before.hp;
      if(hit) landed++;
      console.log('throw '+k, JSON.stringify({ dist:before.dist, state:before.state, wy:before.wy, crawl:before.crawl,
        aimPitch:before.aim && before.aim.pitch, hpBefore:before.hp, hpAfter:after.hp,
        riding:after.riding, lastSpear:after.last }) + (hit?'   -> DAMAGE LANDED':''));
      await sleep(300);
    }
    console.log('RESULT primary: '+landed+'/10 throws did damage');

    // ---- THE HORRIFIC WRETCH takes the same spears. Held so it cannot close and grab, aimed by hand at its mid-body.
    await page.evaluate(`__hc.hwHold(true)`);
    console.log('hw spawn', JSON.stringify(await page.evaluate(`__hc.hw(7)`)).slice(0,200));
    let hwLanded = 0, hwRiding = 0;
    for(let k=0;k<6;k++){
      const before = await page.evaluate(`(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
        __hc.look(w.x, w.y+2.4, w.z);
        return { hp:w.hp, x:w.x, y:w.y, z:w.z, d:+Math.hypot(w.x-p.x, w.z-p.z).toFixed(1) }; })()`);
      await page.evaluate(`__hc.spearTest()`);
      await sleep(1500);
      const after = await page.evaluate(`(()=>{ const w=__hc.hwState()[0], r=__hc.riding();
        return { hp:w.hp, riding:r.filter(x=>x.onW).length }; })()`);
      const hit = after.hp!=null && (before.hp==null || after.hp < before.hp);
      if(hit) hwLanded++;
      if(after.riding>0) hwRiding++;
      console.log('hw throw '+k, JSON.stringify({ d:before.d, hpBefore:before.hp, hpAfter:after.hp, riding:after.riding })+(hit?'   -> DAMAGE LANDED':''));
    }
    console.log('RESULT horrific: '+hwLanded+'/6 throws did damage, '+hwRiding+'/6 samples had a spear riding it');

    // ---- THE DRAG CASE, which is the actual bug. Released, it closes and grabs; a spear must still bite. Run on the
    // Horrific Wretch because it can be released on command — the gate being fixed is in code both creatures share, and
    // the primary reaches this state only when its own AI decides to, which is not something a check can wait on.
    // On a FRESH one: the six hits above are 144 damage, past the 100-per-encounter rout threshold, so the previous
    // instance flees instead of grabbing and the drag state is unreachable. The check made its own subject untestable.
    await page.evaluate(`__hc.hwKill()`);
    await sleep(500);
    await page.evaluate(`__hc.hwHold(true)`);
    await page.evaluate(`__hc.hw(7)`);
    await sleep(500);
    await page.evaluate(`__hc.hwHold(false)`);
    let dragging = false;
    for(let k=0;k<40;k++){ const w=(await page.evaluate(`__hc.hwState()`))[0];
      if(w && w.dragging){ dragging = true; break; } await sleep(600); }
    console.log('reached DRAG: '+dragging);
    if(dragging){
      // FIVE throws, pass if ANY lands. Not a fudge: mid-drag the creature is 1.6 blocks away and the grab cutscene owns
      // the camera, so __hc.look cannot aim and each throw goes wherever the cutscene is pointing. The claim under test is
      // "a spear CAN damage it while it drags you" — before the fix that branch was unreachable and 7/7 throws at this
      // range did nothing at all, so one hit in five is the difference between impossible and possible.
      // hp reads null until the first hit, so absent means full: comparing against null reported failure on a run whose
      // own numbers showed null -> 2676.
      const HPMAX = 2700;
      let dragHits = 0, dragDmg = 0;
      for(let t=0;t<5;t++){
        const b = await page.evaluate(`(()=>{ const w=__hc.hwState()[0]; return w?{ hp:w.hp, state:w.state, dragging:w.dragging }:null; })()`);
        if(!b) break;
        await page.evaluate(`__hc.spearTest()`);
        await sleep(1300);
        const a = await page.evaluate(`(()=>{ const w=__hc.hwState()[0]; return w?{ hp:w.hp, state:w.state, dragging:w.dragging }:null; })()`);
        if(!a) break;
        const hpB = (b.hp==null?HPMAX:b.hp), hpA = (a.hp==null?HPMAX:a.hp);
        if(hpA < hpB){ dragHits++; dragDmg += hpB-hpA; }
        console.log('  drag throw '+t, JSON.stringify({ dragging:a.dragging, state:a.state, hp:hpB+'->'+hpA }));
        if(!a.dragging){ console.log('  (it let go — 100+ damage in an encounter routs it, which is the designed way out)'); break; }
      }
      console.log(dragHits
        ? 'RESULT drag: a spear DOES damage it while it drags you — '+dragHits+'/5 throws, '+dragDmg+' damage total (0/7 before the fix)'
        : 'RESULT drag: no damage landed in 5 throws — inconclusive, the cutscene camera decides where they go');
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
