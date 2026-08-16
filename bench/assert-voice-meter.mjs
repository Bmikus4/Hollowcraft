// THE MICROPHONE IS LIVE AND THE METER TRACKS IT — singleplayer, no network.
//
// Ben, 08-16: "mic always on nomatter what, with a sound meter in the bottom left above the existing health,
// stamina water and food bars."
//
// VERIFIED WITH NUMBERS, NOT BY LISTENING. Chrome's fake media device produces a real tone through the real
// getUserMedia path, so capture, the analyser and the meter are all exercised for real — only the microphone is
// synthetic. That is the difference between testing this and asserting that a function was called.
//   --use-fake-device-for-media-stream   a device that exists and emits a tone
//   --use-fake-ui-for-media-stream       the grant is auto-accepted, which is the granted path
// THE REFUSED PATH IS TESTED SEPARATELY, in a second context with permissions denied, because "the game carries on
// when the mic is refused" is the half of this feature that a fake-accepted device can never reach.
//
//   node bench/assert-voice-meter.mjs
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
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  const boot=async(ctx)=>{
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    return page; };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});

    // ---- GRANTED: capture runs, the meter moves, the row is in the stack ----
    const ctx=await browser.newContext({viewport:{width:1000,height:560},permissions:['microphone']});
    const page=await boot(ctx);
    // The grant rides the pointer lock in the game; the probe asks for it directly so the bench does not depend on
    // a headless browser's pointer-lock behaviour to test the microphone.
    await page.evaluate(`__hc.voiceAsk()`);
    await page.waitForFunction(`(()=>{try{const v=__hc.voiceProbe(); return v.state==='live'||v.state==='denied'||v.state==='nodevice'||v.state==='unsupported'||v.state==='error';}catch(e){return false;}})()`,null,{timeout:20000}).catch(()=>{});
    let V=await page.evaluate(`__hc.voiceProbe()`);
    console.log('  '+JSON.stringify(V));
    check('the microphone was asked for and capture is live', V.state==='live', `state ${V.state} err ${V.err}`);
    check('no push-to-talk: it is running without any key held', V.state==='live', `state ${V.state}`);
    await sleep(1500);
    V=await page.evaluate(`__hc.voiceProbe()`);
    check('the analyser is actually being read every frame', V.frames>30, `${V.frames} frames`);
    // THE TONE IS THE POINT. A meter wired to a constant, or to nothing, passes every check above this one.
    check('THE METER TRACKS THE INPUT LEVEL', V.rms>0.0005 && V.level>0.05, `rms ${V.rms} level ${V.level}`);
    check('and the bar itself is drawn at that level', V.rowWidth && parseFloat(V.rowWidth)>5, `width ${V.rowWidth}`);
    check('the row is live rather than dimmed', V.rowOff===false, `off ${V.rowOff}`);
    // WHERE BEN ASKED FOR IT: in the vitals stack, at the top of it.
    check('the meter is part of the vitals stack, not an overlay beside it', V.row===true, `row ${V.row}`);
    check('and it sits ABOVE health, food, water and stamina', V.rowFirst===true, `first child ${V.rowFirst}`);
    const geo=await page.evaluate(`(()=>{ const w=document.getElementById('vitals'); if(!w) return null;
      const r=w.getBoundingClientRect(), rows=[...w.children].map(c=>({cls:c.className, top:Math.round(c.getBoundingClientRect().top)}));
      return { left:Math.round(r.left), bottom:Math.round(innerHeight-r.bottom), rows }; })()`);
    console.log('  '+JSON.stringify(geo));
    check('the stack is bottom left', geo && geo.left<40 && geo.bottom<40, JSON.stringify(geo&&{left:geo.left,bottom:geo.bottom}));
    check('and the voice row is the topmost of them', geo && geo.rows[0] && /v-voice/.test(geo.rows[0].cls), geo&&geo.rows[0]&&geo.rows[0].cls);

    // ---- REFUSED: the game carries on and the meter says so ----
    // A SEPARATE CONTEXT, because a permission cannot be taken back inside one. This is the half a fake-accepted
    // device can never reach, and it is the half where a mistake breaks the whole game rather than one feature.
    const ctx2=await browser.newContext({viewport:{width:900,height:520}});
    await ctx2.grantPermissions([]);          // nothing granted
    await ctx2.clearPermissions();
    const page2=await ctx2.newPage();
    await page2.route('**/*', r=>r.continue());
    await page2.addInitScript(()=>{ try{ Object.defineProperty(navigator,'mediaDevices',{ value:{ getUserMedia:()=>Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'})) }, configurable:true }); }catch(e){} });
    await page2.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page2.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page2.evaluate(`__hc.voiceAsk()`); await sleep(1200);
    const D=await page2.evaluate(`__hc.voiceProbe()`);
    console.log('  refused: '+JSON.stringify(D));
    check('a refused microphone is reported as refused', D.state==='denied', `state ${D.state}`);
    check('the game is still running with the mic refused', (await page2.evaluate(`__hc.st().started`))===true, 'started');
    check('and the meter goes dark rather than disappearing', D.row===true && D.rowOff===true, `row ${D.row} off ${D.rowOff}`);
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
