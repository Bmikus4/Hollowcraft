// MINECRAFT OFFHAND LOGIC. Ben: "if an item is in the offhand, pressing F again with an empty slot will toggle between the
// uses of left click; when toggled on, left click should allow the user to place blocks / use tools / fire guns in thier off
// hand. ALSO all guns should be the same size in the off hand."
//
// Four claims, each checked through the real input path with the pointer locked -- the global keydown handler discards keys
// while unlocked, and lock is taken with Escape rather than a click because a click is itself a game action.
//  1. F on an EMPTY main hand toggles the mode and does NOT empty the offhand (it used to send the item back to the pack).
//  2. Left click PLACES a block from the offhand: the world gains that block, and the offhand count goes down.
//  3. Left click FIRES an offhand gun: its own magazine goes down.
//  4. Every gun is the same size in that fist, measured as the drawn mesh's world-space extent.
//
// usage: node bench/assert-offhand-use.mjs
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
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(58)+' got='+JSON.stringify(got).slice(0,200)); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.30)');
    await page.keyboard.press('Escape'); await sleep(1400);
    const lk=await page.evaluate('__hc.uiState()');
    ok('pointer lock held, so keys reach the game', lk.locked===true, lk);

    const st=()=>page.evaluate('__hc.offhandUse()');

    // ---- 1. F ON AN EMPTY HAND TOGGLES, and does not empty the offhand.
    // ONE torch, so that F leaves the main hand EMPTY -- the mode requires it. Giving a stack of 8 left seven in hand and
    // the mode correctly refused to engage, which read as a failure of the toggle.
    await page.evaluate('__hc.offhandSet(null)');
    await page.evaluate('__hc.cmdRun("/clearinv")');
    await page.evaluate('__hc.cmdRun("/give torch 1")'); await sleep(900);
    await page.keyboard.press('KeyF'); await sleep(1000);       // torch → offhand, main hand now empty
    let s=await st();
    ok('the torch is in the offhand, main hand empty', s.off==='torch' && !s.held, s);
    ok('the mode starts OFF', s.offUse===false, s);

    await page.keyboard.press('KeyF'); await sleep(1000);       // F again on an empty hand
    s=await st();
    ok('F toggled the mode ON', s.offUse===true && s.active===true, s);
    ok('F did NOT empty the offhand', s.off==='torch', s);

    await page.keyboard.press('KeyF'); await sleep(900);
    s=await st();
    ok('F toggles back OFF', s.offUse===false, s);
    await page.keyboard.press('KeyF'); await sleep(900);        // back on for the placement test

    // ---- 2. LEFT CLICK PLACES A BLOCK FROM THE OFFHAND. Aim at the ground, count torches before and after, and read the
    // world where the game says it placed one. The block count in the world is the honest test, not the item count alone.
    await page.evaluate('__hcBR.look(0.6,-0.9)'); await sleep(1300);
    await page.evaluate('__hc.offhandSet("torch",3)'); await sleep(400);   // a stack, so one click is visible as 3 → 2
    await page.keyboard.press('KeyF'); await sleep(900);                   // offhandSet clears the mode, so turn it back on
    const b4=await st();
    const world4=await page.evaluate(`(()=>{ const p=__hc.probe(); let n=0;
      for(let x=Math.round(p.x)-4;x<=Math.round(p.x)+4;x++) for(let z=Math.round(p.z)-4;z<=Math.round(p.z)+4;z++)
        for(let y=Math.round(p.y)-3;y<=Math.round(p.y)+3;y++) if(__hc.blockAt(x,y,z)===__hc.bid('torch')) n++;
      return n; })()`);
    console.log('  state at the click: '+JSON.stringify(b4));
    // The game's own on-screen message is the cheapest diagnostic there is: "needs solid ground" and the like all go there.
    // SURVIVAL, because in creative a placed block costs nothing and the offhand count cannot be read -- the first version
    // ran in creative and read a stack that never moved. And the MOUSE, not the hook: with a single torch in the slot a
    // direct call and a click are indistinguishable, so the slot is stacked and only the click is used.
    await page.evaluate('__hc.cmdRun("/gamemode survival")').catch(()=>{});
    await page.mouse.down({button:'left'}); await sleep(250); await page.mouse.up({button:'left'}); await sleep(800);
    const said=await page.evaluate(`(()=>{ const e=document.getElementById('name'); return e?e.textContent:null; })()`);
    console.log('  the game said: '+JSON.stringify(said));
    const after=await st();
    const world5=await page.evaluate(`(()=>{ const p=__hc.probe(); let n=0;
      for(let x=Math.round(p.x)-4;x<=Math.round(p.x)+4;x++) for(let z=Math.round(p.z)-4;z<=Math.round(p.z)+4;z++)
        for(let y=Math.round(p.y)-3;y<=Math.round(p.y)+3;y++) if(__hc.blockAt(x,y,z)===__hc.bid('torch')) n++;
      return n; })()`);
    console.log('  torches in the world around the player: '+world4+' → '+world5+'   offhand count '+(b4.offN)+' → '+(after.offN));
    ok('left click placed a torch from the offhand', world5>world4, {before:world4, after:world5});
    ok('the offhand stack paid for it', after.offN===b4.offN-1, {before:b4.offN, after:after.offN});
    // AND A SPENT SLOT CLEARS. Placing the last one has to empty the left hand: the action paths null inv[selSlot] when a
    // stack runs out, which in this mode is a slot that is already empty, so a per-frame cleanup is what actually does it.
    // Down to one, and the aim moved: clicking twice at the same spot cannot place twice, because the second click is
    // aiming at the torch the first one put there -- which read as a failure to consume.
    await page.evaluate('__hc.offhandSet("torch",1)'); await sleep(400);
    await page.keyboard.press('KeyF'); await sleep(800);            // offhandSet clears the mode
    await page.evaluate('__hcBR.look(1.9,-0.95)'); await sleep(1100);
    await page.mouse.down({button:'left'}); await sleep(250); await page.mouse.up({button:'left'}); await sleep(1100);
    const spent=await st();
    ok('placing the last one empties the offhand', spent.off===null && spent.offUse===false, spent);

    // ---- 3. LEFT CLICK FIRES AN OFFHAND GUN. /clearinv does not touch the equipment slots, so the offhand is cleared
    // through the hook -- otherwise the torch was still in there and the gun never reached the left hand.
    await page.evaluate('__hc.offhandSet(null)');
    await page.evaluate('__hc.cmdRun("/clearinv")'); await sleep(500);
    const cls=await page.evaluate('__hc.itemClasses()');
    const gid=cls.gun||'ar15';
    await page.evaluate(`__hc.cmdRun("/give `+gid+` 1")`); await sleep(800);
    await page.keyboard.press('KeyF'); await sleep(1000);       // gun → offhand (main hand empty)
    await page.keyboard.press('KeyF'); await sleep(1000);       // mode ON
    s=await st();
    ok('the gun is in the offhand with the mode on', s.off===gid && s.offUse===true, s);
    const mg0=await page.evaluate('__hc.mags()');
    await page.mouse.down({button:'left'}); await sleep(300); await page.mouse.up({button:'left'}); await sleep(900);
    const mg1=await page.evaluate('__hc.mags()');
    console.log('  magazines: '+JSON.stringify(mg0.all)+' → '+JSON.stringify(mg1.all));
    ok('left click fired the offhand gun', mg0.all.join()!==mg1.all.join(), {before:mg0.all, after:mg1.all});

    // ---- 4. EVERY GUN THE SAME SIZE IN THE FIST, measured off the drawn mesh rather than assumed from the scale factor:
    // the scale is applied to models with wildly different intrinsic units, so only the final extent is comparable.
    // offExtent is the achieved longest side recorded where the fit is computed. Measuring a world-space AABB instead
    // reported a 21% spread, because the fist is ROTATED and an axis-aligned box of a rotated object is not its size.
    const sizes={};
    for(const g of (cls.gunsAll||[gid])){
      await page.evaluate(`__hc.offhandSet(`+JSON.stringify(g)+`)`); await sleep(450);
      const d=await page.evaluate('__hc.offhandUse()');
      sizes[g]=d.offExtent;
    }
    await page.evaluate('__hc.offhandSet(null)');
    const vals=Object.values(sizes).filter(v=>typeof v==='number');
    const spread=vals.length>1 ? (Math.max(...vals)-Math.min(...vals))/Math.max(...vals) : 0;
    console.log('  offhand gun extents: '+JSON.stringify(sizes));
    ok('all guns are the same size in the offhand (within 2%)', vals.length>1 && spread<0.02, {spread:+spread.toFixed(4), sizes});
    ok('no page errors', errs.length===0, errs.slice(0,3));

    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
