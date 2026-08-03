// ESCAPE CLOSES WHAT IS OPEN. Ben: "esc should close the settings menu, and also close the command window."
//
// The only honest test is a real key event. Calling closeConsole() proves a function works, which was never in doubt -- what
// was broken is WHICH HANDLER SEES THE KEY: the console's input handler stopPropagation's Escape, but only while the input
// has focus, so clicking the world first sent the key to the global handler, which nulled openUI through closeUI() and left
// the console sitting on screen. So: dispatch Escape through Playwright's keyboard and then ask the ELEMENTS what is visible.
// __hc.uiState() reads the elements, not openUI -- trusting openUI is exactly how the broken build looked fixed.
//
// The pause/settings overlay is dismissed by ACQUIRING POINTER LOCK (pointerlockchange hides it), so this also reports
// whether lock was obtainable at all: if the browser refuses the lock the overlay legitimately stays up, and that is a
// browser gate rather than a defect in the handler. The wire is checked separately by spying on requestPointerLock.
//
// usage: node bench/assert-escape.mjs
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
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(54)+' got='+JSON.stringify(got)); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1000,height:620} })).newPage();
    page.on('pageerror', e=>{ console.log('PAGEERROR:', String(e.message||e).slice(0,240)); fails++; });
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(5000);

    const state = ()=>page.evaluate('__hc.uiState()');
    // Count every pointer-lock REQUEST, so a stuck overlay can be told apart from a handler that never asked.
    await page.evaluate(`(()=>{ window.__lockTries=0; const c=document.querySelector('canvas'); const f=c.requestPointerLock.bind(c);
      c.requestPointerLock=function(...a){ window.__lockTries++; return f(...a); }; })()`);

    // ---- 1. THE COMMAND WINDOW, with its input NOT focused (the case that was broken).
    await page.keyboard.press('KeyT'); await sleep(700);
    let s=await state();
    ok('T opens the command window', s.cmdVisible===true && s.openUI==='cmd', s);

    await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
    await sleep(250);
    s=await state();
    ok('the console input is genuinely unfocused', s.cmdFocused===false, s);

    await page.keyboard.press('Escape'); await sleep(800);
    s=await state();
    ok('escape closes the console (input unfocused)', s.cmdVisible===false, s);
    ok('escape leaves no half-closed state', s.openUI===null, s);

    // ---- 1b. And with the input FOCUSED, which goes through the input's own handler. Both paths must work.
    await page.keyboard.press('Slash'); await sleep(700);
    s=await state();
    ok('slash opens the console, input focused', s.cmdVisible===true && s.cmdFocused===true, s);
    await page.keyboard.press('Escape'); await sleep(800);
    s=await state();
    ok('escape closes the console (input focused)', s.cmdVisible===false && s.openUI===null, s);

    // ---- 2. THE SETTINGS / PAUSE OVERLAY. It appears whenever pointer lock is lost while playing, which is what Escape
    //         does in a real session, so losing the lock is how it is raised here too.
    await page.evaluate('document.exitPointerLock && document.exitPointerLock()'); await sleep(400);
    await page.evaluate(`(()=>{ if(typeof buildPauseSettings==='function') buildPauseSettings(); if(pause) pause.style.display='flex'; })()`);
    await sleep(600);
    s=await state();
    ok('the settings overlay is up to begin with', s.pauseVisible===true, s);

    const triesBefore=await page.evaluate('window.__lockTries');
    await page.keyboard.press('Escape'); await sleep(1200);
    const triesAfter=await page.evaluate('window.__lockTries');
    s=await state();
    ok('escape asks for the lock back', triesAfter>triesBefore, {before:triesBefore, after:triesAfter});
    // Whether the overlay actually goes is the browser's call: headless Chrome refuses pointer lock, and in that case the
    // overlay staying up is correct behaviour, not the bug. Reported either way rather than passed either way.
    const lockWorks = s.locked===true;
    if(lockWorks) ok('escape dismisses the settings overlay', s.pauseVisible===false, s);
    else console.log('  note  the browser refused pointer lock ('+JSON.stringify(s)+') -- the overlay is dismissed by the'
      + '\n        pointerlockchange handler, so its disappearance cannot be observed here. The request was made, which is'
      + '\n        the part this build changed; Ben\'s eye settles the rest in a real window.');

    await page.screenshot({path:path.join(ROOT,'bench','results','escape-after.png')});
    console.log('\n'+checks+' checks, '+fails+' failed');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
