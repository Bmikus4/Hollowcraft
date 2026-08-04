// DOES A CANOPY SILENCE THE AMBIENT BED? I claimed it did, on the strength of one 12-second window that counted zero cues at
// spawn, and the explanation I gave was wrong: ambientOneShot's early-out reads opaqueTop, which is built from occludesSky, and
// leaves/leaves_core are deliberately excluded from that (it was the fix for dark faces in the woods). So the canopy should not
// register at all. This settles it with a rate over a long window instead of a story: on the ground in the wood versus above the
// treeline, hush 0 both times, and it reports the `under` flag the function itself tests.
// 90 s per window because the gaps are 3-9 s: a 12 s sample can read zero by luck, which is exactly how I got this wrong.
//   node bench/tmp-canopy-amb.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); __hc.setTime(0.75); })()').catch(()=>{});
    await page.mouse.click(450,300);
    await page.evaluate('__hc.audioOn()');
    await page.evaluate('__hc.dreadSet(0)'); await page.evaluate('__hc.threatSet(0)');
    await sleep(3000);
    const g=await page.evaluate('__hc.probe()');
    const window_=async(label, place)=>{
      await place();
      await page.evaluate('__hc.ambCount(true)');
      let flagged=0, n=0;
      for(let s=0;s<90;s+=3){ await place(); const c=await page.evaluate('__hc.ambCount()'); if(c.under)flagged++; n++; await sleep(3000); }
      const c=await page.evaluate('__hc.ambCount()');
      console.log('  '+label.padEnd(22)+' one-shots '+String(c.oneShots).padStart(3)+'   crickets '+String(c.crickets).padStart(3)
        +'   under '+flagged+'/'+n+' samples   htop '+c.htop+'  camY '+c.camY);
      return c;
    };
    await window_('on the ground (wood)', async()=>{ await page.evaluate(`__hc.tp(${g.x},${g.z})`); });
    await window_('above the treeline',  async()=>{ await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); });
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
