// ASSERTION: the equipment column really is six slots, the routing rules hold, and nothing the equip path touches
// leaks into the four armour slots' guarantees.
//
// Failing-test-first, and proved capable of failing on THIS build before any PASS counts:
//   ?noequip2=1 collapses the column back to the old four slots and makes the carry pair refuse everything.
//   With that flag the run must FAIL; without it, PASS.
//
// It drives the SAME entry points the mouse drives — eqAccepts, eqTarget, slotClick('inv',i,0,true) — instead of writing
// the `armor` array directly. That distinction is the whole point here: eqTarget shipped MISSING, so every shift-click
// threw a ReferenceError, and a harness that poked `armor` straight would have passed over the top of that crash.
//
// usage: node bench/assert-equip.mjs [flags]     e.g. noequip2=1
//        exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const KILLED = /noequip2/.test(FLAGS);

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Each case returns {name, got, want, ok}. Collected so one run reports every failure, not just the first.
const CASES = [];
// Wait for a STATE, not a duration. A fixed sleep after an action is a bet on frame timing: it passes while frames are
// quick and fails when one is slow. Returns the last value either way, so a genuinely broken feature still reports a
// clean FAIL through check() rather than throwing.
const settleFor = async (page, expr, pred, ms=6000) => { const t0=Date.now();
  for(;;){ const v = await page.evaluate(expr); if(pred(v)) return v;
    if(Date.now()-t0>ms) return v; await sleep(50); } };

function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  CASES.push({name, got, want, ok});
  console.log('  '+(ok?'ok  ':'FAIL')+'  '+name.padEnd(52)+' got='+JSON.stringify(got)+(ok?'':'  want='+JSON.stringify(want)));
  return ok;
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false; const pageErrors=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    const hookErrors = e=>{ const m=String(e.message||e).slice(0,300); pageErrors.push(m); console.log('PAGEERROR:', m); };
    page.on('pageerror', hookErrors);
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage(); page.on('pageerror', hookErrors);
    }
    await page.goto(base+'/index.html?debug=1&rd=6'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(3000);

    // The equip column only exists once the inventory UI has been built.
    await page.evaluate('__hc.eqUI("inv")');
    await settleFor(page, '__hc.equip().cells', v => v > 0);   // the equip column exists only once buildContainers has run
    const E = await page.evaluate('__hc.equip()');
    console.log('kill switch '+(KILLED?'ON  (?noequip2=1) — every assertion below is EXPECTED to fail':'off — feature live'));
    console.log('EQ_N='+E.EQ_N+' EQ_OFF='+E.EQ_OFF+' EQ_PACK='+E.EQ_PACK+' _NO_EQ2='+E._NO_EQ2);

    // ---------- 1. the column really renders six cells ----------
    console.log('\n[1] column');
    check('#armorcol cell count', E.cells, 6);

    // ---------- 2. eqAccepts routing ----------
    console.log('\n[2] eqAccepts — what each slot takes');
    const ask = (idx,id)=>page.evaluate('__hc.eqAsk('+idx+',"'+id+'")');
    check('helmet -> slot 0',        (await ask(0,'iron_helmet')).accepts, true);
    check('helmet -> slot 1 refused',(await ask(1,'iron_helmet')).accepts, false);
    check('helmet -> EQ_OFF (any item)', (await ask(4,'iron_helmet')).accepts, true);
    check('torch  -> EQ_OFF (any item)', (await ask(4,'torch')).accepts, true);
    check('torch  -> EQ_PACK refused',   (await ask(5,'torch')).accepts, false);
    check('backpack -> EQ_PACK',         (await ask(5,'backpack')).accepts, true);

    // ---------- 3. eqTarget — D1, the function that did not exist ----------
    console.log('\n[3] eqTarget — shift-click routing (D1)');
    await page.evaluate('__hc.eqPut(0,null);__hc.eqPut(1,null);__hc.eqPut(4,null);__hc.eqPut(5,null)');
    check('iron_helmet -> 0',   (await ask(0,'iron_helmet')).target, 0);
    check('backpack    -> 5',   (await ask(0,'backpack')).target, 5);
    check('torch       -> -1 (no offhand hijack)', (await ask(0,'torch')).target, -1);
    await page.evaluate('__hc.eqPut(0,"leather_helmet")');
    check('occupied slot 0 -> -1', (await ask(0,'iron_helmet')).target, -1);
    await page.evaluate('__hc.eqPut(0,null)');

    // ---------- 4. the real shift-click path must not throw ----------
    console.log('\n[4] slotClick shift path — the ReferenceError that shipped');
    const errBefore = pageErrors.length;
    const s1 = await page.evaluate('__hc.eqShift(10,"iron_helmet")');
    check('shift-click iron_helmet lands in slot 0', s1.armor ? s1.armor[0] : s1, 'iron_helmet');
    const s2 = await page.evaluate('__hc.eqShift(11,"backpack")');
    check('shift-click backpack lands in EQ_PACK',   s2.armor ? s2.armor[5] : s2, 'backpack');
    check('no page error thrown by the shift path',  pageErrors.length - errBefore, 0);

    // ---------- 5. armorDefense must ignore the carry slots ----------
    console.log('\n[5] armorDefense stays armour-only');
    await page.evaluate('__hc.eqPut(0,null);__hc.eqPut(1,null);__hc.eqPut(4,null);__hc.eqPut(5,null)');
    const d0 = (await page.evaluate('__hc.equip()')).def;
    await page.evaluate('__hc.eqPut(4,"iron_chestplate")');
    const d1 = (await page.evaluate('__hc.equip()')).def;
    await page.evaluate('__hc.eqPut(1,"iron_chestplate")');
    const d2 = (await page.evaluate('__hc.equip()')).def;
    check('chestplate in EQ_OFF adds no defence', d1, d0);
    check('chestplate in slot 1 DOES add defence', d2 > d1, true);

    // ---------- 6. save/load keeps armor[4] and armor[5] ----------
    console.log('\n[6] save/load round-trip');
    await page.evaluate('__hc.eqPut(4,"torch");__hc.eqPut(5,"backpack")');
    await page.evaluate('__hc.save()');
    await page.evaluate('__hc.eqPut(4,null);__hc.eqPut(5,null)');
    await page.evaluate('__hc.loadNow()');
    await settleFor(page, '__hc.equip().slots[4]', v => v != null);   // applySave has landed when the carry slot repopulates
    const R = (await page.evaluate('__hc.equip()')).slots;
    check('armor[4] survives save/load', R[4], 'torch:1');
    check('armor[5] survives save/load', R[5], 'backpack:1');

    // ---------- 7. D2 — the pack is findable while WORN ----------
    // openBackpack() is called directly rather than via the B key: the KeyB branch sits behind the pointer-lock guard,
    // and headless has no pointer lock. hasBackpack() is the thing D2 actually changed, and it is checked on its own.
    console.log('\n[7] wearing the pack (D2)');
    await page.evaluate('__hc.eqPut(4,null);__hc.eqPut(5,"backpack")');
    check('inventory emptied first (so only the WORN pack can be found)', await page.evaluate('__hc.eqClearInv()'), 0);
    const worn = await page.evaluate('__hc.equip()');
    check('hasBackpack() true when worn in EQ_PACK, none in inv', worn.pack, true);
    await page.evaluate('__hc.eqUI("pack")');
    await settleFor(page, '__hc.backpack().ui', v => v === 'chest');
    const bp = await page.evaluate('__hc.backpack()');
    check('openBackpack opens the chest UI', bp.ui, 'chest');
    check('titled Backpack', bp.title, 'Backpack');

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }

  const failed = CASES.filter(c=>!c.ok);
  console.log('\n'+CASES.length+' checks, '+failed.length+' failed');
  // Name the failing assertion with got/want. Sampling only the tail of a run is how a one-in-six flake in a sibling
  // harness went undiagnosed, and it is the single change that made this class of defect findable.
  if(failed.length) console.log('FAILED: '+failed.map(c=>c.name+' [got '+JSON.stringify(c.got)+' want '+JSON.stringify(c.want)+']').join('  |  '));
  if(KILLED){
    // The kill switch must break the feature. If everything still passes with it on, this file proves nothing.
    if(failed.length===0){ console.log('ABORT: kill switch ON but every check passed — a check that cannot fail is not evidence.'); fail=true; }
    else { console.log('kill switch caught '+failed.length+' failures — the check can fail. Expected: '+failed.map(c=>c.name).join(', ')); fail=false; }
  } else {
    fail = failed.length>0;
  }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
