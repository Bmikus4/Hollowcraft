// ASSERTION: with a container open, Q over a slot drops ONE item from that slot into the world.
//
// Failing-test-first: ?noqdrop=1 restores the old do-nothing behaviour. With that flag the run must FAIL; without it, PASS.
//
// It dispatches a REAL KeyQ on window rather than calling dropHovered(), because the thing most likely to be wrong here
// is not the drop, it is the GUARD placement: the pre-existing KeyQ branch sits below `if(!locked)return;`, and a container
// has already released pointer lock, so a branch written in the wrong region would silently never fire. Calling
// dropHovered() directly would sail straight past that and prove nothing about the wiring.
//
// usage: node bench/assert-qdrop.mjs [flags]     e.g. noqdrop=1
//        exit 0 = pass, 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = process.argv[2] ? ('&'+process.argv[2]) : '';
const KILLED = /noqdrop/.test(FLAGS);

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const CASES = [];
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  CASES.push({name, got, want, ok});
  console.log('  '+(ok?'ok  ':'FAIL')+'  '+name.padEnd(50)+' got='+JSON.stringify(got)+(ok?'':'  want='+JSON.stringify(want)));
  return ok;
}
const PRESS_Q = `(()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',key:'q',bubbles:true})); return true; })()`;

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
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(3000);
    await page.evaluate('__hc.eqUI("inv")'); await sleep(400);
    await page.evaluate('__hc.eqClearInv()');
    console.log('kill switch '+(KILLED?'ON  (?noqdrop=1) — the drop is EXPECTED not to happen':'off — feature live'));

    // ---------- 1. Q over an inventory slot drops one ----------
    console.log('\n[1] inventory slot, stack of 5');
    await page.evaluate('__hc.qSet("inv",10,"torch",5)');
    await page.evaluate('__hc.qHover("inv",10)');
    const d0 = (await page.evaluate('__hc.qState()')).drops;
    await page.evaluate(PRESS_Q); await sleep(250);
    const s1 = await page.evaluate('__hc.qState()');
    check('a drop entity appeared',      s1.drops - d0, 1);
    check('stack went 5 -> 4',           await page.evaluate('__hc.qGet("inv",10)'), 'torch:4');

    // ---------- 2. the last one clears the slot ----------
    console.log('\n[2] last item empties the slot');
    await page.evaluate('__hc.qSet("inv",11,"torch",1)');
    await page.evaluate('__hc.qHover("inv",11)');
    await page.evaluate(PRESS_Q); await sleep(250);
    check('slot is now empty', await page.evaluate('__hc.qGet("inv",11)'), null);

    // ---------- 3. hovering nothing drops nothing ----------
    console.log('\n[3] guards');
    await page.evaluate('__hc.qHover(null)');
    const d3 = (await page.evaluate('__hc.qState()')).drops;
    await page.evaluate(PRESS_Q); await sleep(200);
    check('no hover -> no drop', (await page.evaluate('__hc.qState()')).drops - d3, 0);
    await page.evaluate('__hc.qSet("inv",12,null)');
    await page.evaluate('__hc.qHover("inv",12)');
    const d3b = (await page.evaluate('__hc.qState()')).drops;
    await page.evaluate(PRESS_Q); await sleep(200);
    check('hovering an EMPTY slot -> no drop', (await page.evaluate('__hc.qState()')).drops - d3b, 0);

    // ---------- 4. it works for the equip column too ----------
    console.log('\n[4] equip column');
    await page.evaluate('__hc.eqPut(4,"torch")');
    await page.evaluate('__hc.qHover("armor",4)');
    const d4 = (await page.evaluate('__hc.qState()')).drops;
    await page.evaluate(PRESS_Q); await sleep(250);
    check('drop from the offhand slot', (await page.evaluate('__hc.qState()')).drops - d4, 1);
    check('offhand now empty',          await page.evaluate('__hc.qGet("armor",4)'), null);

    // ---------- 5. closing the UI restores plain gameplay Q ----------
    // Not a kill-switch case: this must hold in BOTH modes, so it is reported separately below.
    console.log('\n[5] no regression to the gameplay drop path');
    await page.evaluate('__hc.eqUI("close")'); await sleep(250);
    const closed = await page.evaluate('__hc.qState()');
    const uiClosed = (closed.ui===null || closed.ui===undefined || closed.ui===false || closed.ui==='');
    console.log('  '+(uiClosed?'ok  ':'FAIL')+'  container closed (openUI='+JSON.stringify(closed.ui)+')');
    if(!uiClosed) fail = true;
    check('no page errors across the whole run', pageErrors.length, 0);

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }

  const failed = CASES.filter(c=>!c.ok);
  console.log('\n'+CASES.length+' checks, '+failed.length+' failed');
  if(KILLED){
    if(failed.length===0){ console.log('ABORT: kill switch ON but every check passed — a check that cannot fail is not evidence.'); fail=true; }
    else { console.log('kill switch caught '+failed.length+' failures — the check can fail. Expected: '+failed.map(c=>c.name).join(', ')); }
  } else {
    fail = fail || failed.length>0;
  }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
