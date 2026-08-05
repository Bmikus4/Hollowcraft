// The loop's own catch swallows a per-frame exception. window._loopErr holds the first one. Spawn a
// Horrific Wretch and read it, plus whether the profiler ring commits either side of the spawn — commit()
// is the LAST thing in loop(), so "no frames committed" and "the loop threw" are the same fact.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,300)));
    page.on('console',m=>{ if(m.type()==='error') console.log('console.error:',m.text().slice(0,400)); });
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`);
    const pr = await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.tp(${pr.spawnX}, ${pr.spawnZ}); __hc.setTime(0.85); __hc.cam({yaw:0.7,pitch:-0.05}); __hc.lock(true); window._loopErr=null; })()`);
    await sleep(5000);
    const before = await page.evaluate(`(()=>{ __hcPERF.reset(); return null; })()`);
    await sleep(2500);
    console.log('BEFORE spawn: committed frames =', await page.evaluate(`(__hc.frameProf(600)||{}).frames||0`), ' loopErr =', await page.evaluate(`window._loopErr`));
    console.log('spawn ->', JSON.stringify(await page.evaluate(`(()=>{ const r=__hc.hw(11); return {hw:(__hc.hwState()||[]).length}; })()`)));
    await sleep(1500);
    await page.evaluate(`(()=>{ window._loopErr=null; __hcPERF.reset(); })()`);
    await sleep(3000);
    const frames = await page.evaluate(`(__hc.frameProf(600)||{}).frames||0`);
    const err = await page.evaluate(`window._loopErr`);
    const hwErr = await page.evaluate(`window._hwErr||null`);
    console.log('AFTER  spawn: committed frames =', frames);
    console.log('\n_loopErr (the exception the loop catches every frame):\n', err ? String(err).slice(0,1200) : '(none)');
    if(hwErr) console.log('\n_hwErr (the drift step\'s own catch):\n', String(hwErr).slice(0,700));
    // which stage of the loop still runs: hud is timed just before commit, sim near the top
    console.log('\nper-system ms the ring did manage to record:', JSON.stringify(await page.evaluate(`(__hc.frameProf(600)||{}).ms||{}`)));

    // Now the exact sequence perf-hw-cost.mjs uses, one step at a time, asking after each one whether the
    // ring is still committing. Whichever step turns the count to zero IS the cause.
    const step = async (label, js) => {
      const r = await page.evaluate(`(()=>{ try{ const v=(function(){${js}})(); return {v:v===undefined?null:v}; }catch(e){ return {err:String(e.message||e)}; } })()`);
      await page.evaluate(`__hcPERF.reset()`);
      await sleep(2500);
      const n = await page.evaluate(`(()=>{ const p=__hc.frameProf(600); return p&&p.frames||0; })()`);
      const le = await page.evaluate(`window._loopErr||null`);
      console.log(`  ${label.padEnd(28)} -> ring ${String(n).padStart(4)} frames   ${JSON.stringify(r).slice(0,110)}${le?'   loopErr: '+String(le).slice(0,160):''}`);
      await page.evaluate(`window._loopErr=null`);
    };
    console.log('\nstep-by-step, mirroring perf-hw-cost.mjs:');
    await step('kill the creature',        `let n=0; for(const w of (__hc.hwState()||[])){ __hc.hwKill(w.hid); n++; } return {killed:n};`);
    await step('pinScene',                `return __hc.pinScene();`);
    await step('spawn again',             `__hc.hw(11); return {hw:(__hc.hwState()||[]).length};`);
    await step('kill again',              `let n=0; for(const w of (__hc.hwState()||[])){ __hc.hwKill(w.hid); n++; } return {killed:n};`);
    await step('lock+pin, as park() does',`__hc.tp(${pr.spawnX}, ${pr.spawnZ}); __hc.setTime(0.85); __hc.cam({yaw:0.7,pitch:0}); __hc.pinScene(); __hc.lock(true); return __hc.pos();`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
