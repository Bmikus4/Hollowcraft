// TURNING MOTION BLUR OFF MUST NOT DELETE THE GOD RAYS.
//
// Ben, 08-05: "god rays are gone from the sun." He is right, and the pass is not broken — bench/tmp-godray-alive.mjs forces the
// gain and finds it alive at the shipped strength: max gain 76 levels, 9.7% of the frame moved. What was wrong is that the pass
// was never BUILT unless the motion-blur SETTING was on.
//
// THE MECHANISM: the god rays and the SSAO both need the scene's DEPTH, and depth exists only as a texture on _sceneRT — the
// render target of the motion-blur path. buildComposer gated all three on the same `_mbMode`, which includes the POSTFX setting.
// So switching motion blur off in Settings silently removed the god rays and the ambient occlusion with it. Ben had every reason
// to switch it off: he had just reported the blur smearing his hands and gun.
//
// The fix splits the two: `_rtPath` is "the scene renders into our depth-carrying target", `_mbMode` is "and the blur is applied".
// The motion pass was already written as a pass-through bridge when disabled (uEnabled in its own shader), so it stays in the
// chain either way and the depth texture stays alive.
//
// TWO BOOTS, because the setting is read from localStorage at load and the composer is built once — asserting it in one page
// would test setMotionBlur's rebuild rather than what a player who turned it off actually gets on their next launch.
//
//   node bench/assert-godray-survives-mb.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    const boot=async(mb)=>{
      const ctx=await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1});
      await ctx.addInitScript(`try{ localStorage.setItem('hollowcraft_grain','0'); localStorage.setItem('hollowcraft_mb','${mb?'1':'0'}'); localStorage.setItem('hollowcraft_q','High'); }catch(e){}`);
      const page=await ctx.newPage();
      page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
      await page.goto(base+PAGE+'?debug=1&rd=6',{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      // the sun has to be up for the pass to be ENABLED, but `pass` (was it built at all) is independent of that
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.setTime(0.42);`); await sleep(700);
      const g=await page.evaluate(`__hc.godrays()`), p=await page.evaluate(`__hc.postfx()`);
      await ctx.close();
      return { g, p };
    };

    const on=await boot(true);
    console.log(`  motion blur ON : godrays pass ${on.g.pass}, hasDepth ${on.g.hasDepth}, mbMode ${on.p.mbMode}, motionPass ${on.p.motionPass}`);
    check('with the blur on, the god rays exist', on.g.pass===true && on.g.hasDepth===1, JSON.stringify({pass:on.g.pass,hasDepth:on.g.hasDepth}));
    check('and the blur is genuinely on', on.p.mbOn===true && on.p.mbMode===true, JSON.stringify({mbOn:on.p.mbOn,mbMode:on.p.mbMode}));

    const off=await boot(false);
    console.log(`  motion blur OFF: godrays pass ${off.g.pass}, hasDepth ${off.g.hasDepth}, mbMode ${off.p.mbMode}, motionPass ${off.p.motionPass}`);
    // THE WHOLE POINT. Before the split this read pass:false, hasDepth:null.
    check('with the blur OFF, the god rays still exist', off.g.pass===true && off.g.hasDepth===1, JSON.stringify({pass:off.g.pass,hasDepth:off.g.hasDepth}));
    check('and the blur really is off', off.p.mbOn===false && off.p.mbMode===false, JSON.stringify({mbOn:off.p.mbOn,mbMode:off.p.mbMode}));
    // The bridge has to still be in the chain, or there is no depth texture to hand the god rays.
    check('the motion pass stays as the scene bridge', off.p.motionPass===true, `motionPass ${off.p.motionPass}`);

    check('no page errors in either boot', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
