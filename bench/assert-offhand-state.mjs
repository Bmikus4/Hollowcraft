// THE OFFHAND HOLDS THE ACTUAL ITEM. Ben: "lights and guns held in an off hand should not correlate to thier stack, or
// where they came from. also lighting should emit from off hand lighting."
//
// Two claims, both measurable:
//  1. A torch in the offhand lights the WORLD, not just the fist. Measured as pixels, at night, in an unlit place: put the
//     torch in the offhand and the ground has to get brighter. The viewmodel is excluded by sampling the ground well away
//     from where the hands are drawn.
//  2. A gun's magazine belongs to the gun. Fire some rounds, move it to the offhand, move it back, and the count has to be
//     what it was -- not a fresh full magazine (which is what a new object got: "first draw = it came loaded") and not lost.
//
// usage: node bench/assert-offhand-state.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(56)+' got='+JSON.stringify(got).slice(0,200)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:900,height:560} })).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.72)'); await sleep(2000);   // deep night: a torch is the only light there is

    const shoot=async(tag)=>{ const f=path.join(OUT,'offhand-state-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    // The GROUND in the middle-lower frame, away from the columns the hands are drawn in. Looking down at it so the pool
    // is the subject; the hands sit left and right of centre, so a narrow central strip is world, not viewmodel.
    const groundLum=(im)=>{ let s=0,n=0;
      for(let y=Math.floor(im.h*0.55); y<Math.floor(im.h*0.72); y++) for(let x=Math.floor(im.w*0.42); x<Math.floor(im.w*0.58); x++){
        const i=(y*im.w+x)*im.ch; s+=0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]; n++; }
      return s/Math.max(1,n); };

    // POINTER LOCK FIRST. The global keydown handler returns early unless `locked`, and F lives below that guard -- so
    // every key this harness pressed was discarded, both torch readings were of the MAIN hand, and the offhand claim was
    // never tested while three checks reported green.
    // Lock with ESCAPE, not a click. A click is a game action: aimed at the ground being measured it MINED it, which
    // changed the light in the sample and produced a brighter "unlit" baseline than the lit readings. Escape asks for the
    // lock back off the pause overlay and touches nothing in the world.
    await page.keyboard.press('Escape'); await sleep(1400);
    const lk=await page.evaluate('__hc.uiState()');
    ok('pointer lock acquired, so key presses reach the game', lk.locked===true, lk);

    await page.evaluate('__hcBR.look(0.6,-0.85)'); await sleep(1500);   // look down at the ground in front

    // Read the hands at every sample. The readings only mean something paired with what was actually in each hand, and an
    // unpaired sequence is how the first version of this test ended up comparing an empty hand against an empty hand.
    const sample=async(tag)=>{ const m=await page.evaluate('__hc.mags()'); const l=groundLum(await shoot(tag));
      console.log('  '+tag.padEnd(15)+' held='+String(m.held).padEnd(7)+' off='+String(m.off).padEnd(7)+' ground lum '+l.toFixed(2));
      return { lum:l, held:m.held, off:m.off }; };

    await page.evaluate('__hc.cmdRun("/clearinv")').catch(()=>{});
    await sleep(1400);
    const dark=await sample('empty-hands');
    ok('the baseline really is empty-handed', !dark.held && !dark.off, dark);

    // ---- 1. THE MAIN HAND FIRST, as the control: this path already worked, so it calibrates what "lights the world" is.
    await page.evaluate('__hc.cmdRun("/give torch 1")'); await sleep(1000);
    const main=await sample('mainhand-torch');
    ok('a held torch lights the world (control)', main.held==='torch' && main.lum>dark.lum+3, {dark:+dark.lum.toFixed(2), main:+main.lum.toFixed(2)});

    // ---- 2. THE SAME TORCH IN THE OFFHAND, moved with the real F key.
    await page.keyboard.press('KeyF'); await sleep(1400);
    const off=await sample('offhand-torch');
    ok('the torch moved to the offhand and the main hand is empty', off.off==='torch' && !off.held, off);
    ok('an offhand torch lights the world', off.lum > dark.lum+3, {dark:+dark.lum.toFixed(2), offhand:+off.lum.toFixed(2)});
    ok('offhand and main hand light the world alike', Math.abs(off.lum-main.lum) < Math.max(4, main.lum*0.35), {offhand:+off.lum.toFixed(2), main:+main.lum.toFixed(2)});
    await page.keyboard.press('KeyF'); await sleep(1000);            // put it back so the gun test starts clean

    // ---- 2. THE MAGAZINE BELONGS TO THE GUN.
    await page.evaluate('__hc.cmdRun("/clearinv")');
    // Ask the game which item is a gun rather than guessing an id -- guessed ids have failed this harness family before.
    const cls = await page.evaluate(`(()=>{ try{ return __hc.itemClasses(); }catch(e){ return {err:String(e.message||e)}; } })()`);
    const gid = (cls && (cls.gun || cls.revolver || cls.rifle)) || 'revolver';
    console.log('  the game names this gun for the test: '+JSON.stringify(gid)+'   (from '+JSON.stringify(cls).slice(0,140)+')');
    await page.evaluate(`__hc.cmdRun("/give `+gid+` 1")`); await sleep(900);

    const shots = await page.evaluate('__hc.fire(3)');
    const m0 = await page.evaluate('__hc.mags()');
    console.log('  after firing 3: '+JSON.stringify(shots)+'   '+JSON.stringify(m0));
    ok('the gun fired and its magazine went down', shots.fired>0 && shots.mag!=null, shots);

    await page.keyboard.press('KeyF'); await sleep(1100);   // gun → offhand
    let m1 = await page.evaluate('__hc.mags()');
    console.log('  in the offhand: '+JSON.stringify(m1));
    ok('the offhand holds the SAME gun instance, same uid', m1.offUid!=null && m1.offUid===m0.heldUid, {off:m1.offUid, wasHeld:m0.heldUid});
    ok('moving it there did not mint a second magazine', m1.all.length===m0.all.length, {before:m0.all, after:m1.all});

    await page.keyboard.press('KeyF'); await sleep(1100);   // offhand → back to the pack
    const m2 = await page.evaluate('__hc.mags()');
    console.log('  back in the pack: '+JSON.stringify(m2));
    ok('the magazine survived the round trip at its fired count', m2.all.join(' ')===m0.all.join(' '), {before:m0.all, after:m2.all});
    ok('no orphaned magazine was left behind', m2.all.length<=1, m2.all);
    ok('no page errors', errs.length===0, errs.slice(0,3));

    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('  shots: bench/results/offhand-state-*.png');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
