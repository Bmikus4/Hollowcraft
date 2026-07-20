// SAVE/LOAD + ACHIEVEMENTS VERIFIER — boots the game headless, mutates the world,
// saves, reloads the page, restores, and asserts the world/player/achievements survived.
//   node bench/verify-save.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }

let fails = 0;
const T = (name, cond, info='') => { console.log((cond?'PASS':'FAIL')+' — '+name+(info?'   ['+info+']':'')); if(!cond) fails++; };

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd: ROOT, env: {...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    const base = 'http://127.0.0.1:'+port+'/index.html';
    await waitHttp(base);
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message||e).slice(0,300)));

    // ============ PAGE A — fresh world: mutate, save, unlock ============
    await page.goto(base+'?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(12000);   // let the chunk ring + spawn structures stream in
    await page.evaluate(`__hc.wipe() + '|' + __hc.achReset()`);

    const A = await page.evaluate(`(()=>{
      const p = __hc.pos();
      const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
      const bx = px+3, by = py+2, bz = pz+3;
      const before = __hc.editCount();
      const placedId = __hc.setBlockAt(bx,by,bz,'gold_block');
      const after = __hc.editCount();
      __hc.giveItem('diamond',5); __hc.giveItem('ar15',1);
      const saved = __hc.save();
      const info = __hc.saveInfo();
      const ach1 = __hc.achFire('bell');
      return { px,py,pz,bx,by,bz, before, after, placedId, saved, info, ach1, inv:__hc.invList() };
    })()`);
    T('block placement recorded as an edit', A.after===A.before+1 && typeof A.placedId==='number' && A.placedId>0, 'edits '+A.before+'→'+A.after+', id '+A.placedId);
    T('saveGame wrote the save', /^saved \d+ edits$/.test(A.saved), A.saved);
    T('saveInfo sees inventory + position', A.info && A.info.inv>=2 && Array.isArray(A.info.pos), JSON.stringify(A.info));
    T('achievement unlocked + persisted set', Array.isArray(A.ach1) && A.ach1.includes('bell'), JSON.stringify(A.ach1));
    await sleep(600);
    const toast = await page.evaluate(`document.body.innerText.includes('ACHIEVEMENT UNLOCKED') && document.body.innerText.includes('You Rang?')`);
    T('toast notification rendered on screen', toast===true);

    // ============ PAGE B — reload: restore and assert ============
    await page.goto(base+'?debug=1&t=252', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true && __hc.probe().chunkHere===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(9000);
    const B = await page.evaluate(`(()=>{
      const preBlock = __hc.blockAt(${A.bx},${A.by},${A.bz});
      const loaded = __hc.loadNow();
      const postBlock = __hc.blockAt(${A.bx},${A.by},${A.bz});
      const p = __hc.pos();
      return { preBlock, loaded, postBlock, inv:__hc.invList(), ach:__hc.ach(), pos:[p.x,p.y,p.z] };
    })()`);
    T('fresh page starts without the marker block', B.preBlock===0, 'pre='+B.preBlock);
    T('loadNow applied the save', /^loaded \d+ edits$/.test(B.loaded), B.loaded);
    T('marker block restored after load', B.postBlock===A.placedId, 'post='+B.postBlock+' expected='+A.placedId);
    T('inventory restored (diamond + rifle)', B.inv.includes('diamond:5') && B.inv.some(s=>s.startsWith('ar15:')), JSON.stringify(B.inv));
    T('player position restored', B.pos && Math.abs(B.pos[0]-(A.px+0.5))<3 && Math.abs(B.pos[2]-(A.pz+0.5))<3, JSON.stringify(B.pos)+' vs '+A.px+','+A.pz);
    T('achievements persisted across reload', B.ach && B.ach.got.includes('bell') && B.ach.total===15, JSON.stringify(B.ach));

    // ============ PAGE C — main menu shows Continue when a save exists ============
    await page.goto(base, { waitUntil:'load', timeout:90000 });
    await sleep(2500);
    const C = await page.evaluate(`(()=>({
      cont: document.getElementById('continue-row') && document.getElementById('continue-row').style.display,
      info: (document.getElementById('continue-info')||{}).textContent,
      note: document.getElementById('host-resume-note') && document.getElementById('host-resume-note').style.display,
      savebtn: !!document.getElementById('savebtn') }))()`);
    T('menu shows Continue row for existing save', C.cont==='flex', 'display='+C.cont);
    T('continue-info describes the save', /saved .*edits/.test(C.info||''), C.info);
    T('host panel warns it will resume the save', C.note==='block');
    T('pause menu has a Save Game button', C.savebtn===true);

    T('zero page errors across all three loads', errors.length===0, errors.join(' | ').slice(0,400));
    await browser.close();
  } catch(e) { console.error('HARNESS ERROR:', e); fails++; }
  finally { try{ server.kill(); }catch(e){} }
  console.log(fails===0 ? 'ALL PASS' : fails+' FAILURE(S)');
  process.exit(fails===0?0:1);
})();
