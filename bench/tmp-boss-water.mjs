// WHY THE OCEAN IS CLEAR DURING THE CERAPHIM FIGHT (Ben 08-04: "look at the ocean during the ceraphim boss battle, it is
// clear, and shows clear layers when looked at from above, we need the water to look like that").
// Rather than guess which of a dozen boss side-effects does it: snapshot every piece of state the water's appearance depends
// on, before and after the boss is raised, and print what MOVED.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// Everything reachable from __hc, because page.evaluate cannot see module scope — the first version of this reached straight
// for waterMat and got "waterMat is not defined".
const PROBE=`(()=>{ const o={};
  const put=(p,v)=>{ if(v&&typeof v==='object'){ for(const k in v) o[p+'.'+k]=JSON.stringify(v[k]); } else o[p]=JSON.stringify(v); };
  put('vis', __hc.vis()); put('seaCurve', __hc.seaCurve()); put('glade', __hc.glade());
  put('band', __hc.horizonBand()); put('farSea', __hc.farSeaOn()); put('overcast', __hc.overcast());
  put('sunDisc', __hc.sunDisc()); put('horizonDbg', __hc.horizonDbg()); put('scene', __hc.sceneState());
  o['boss']=JSON.stringify(!!(__hc.st().wa && __hc.st().form));
  o['stForm']=JSON.stringify(__hc.st().form);
  return o; })()`;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.setTime(0.22);`);
    await sleep(2500);
    const before=await page.evaluate(PROBE);
    await page.evaluate(`__hc.boss({dist:16})`);
    await sleep(4000);
    const after=await page.evaluate(PROBE);
    console.log('  boss raised:', after['boss'], ' form', after['stForm']);
    const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
    for(const k of keys){ if(before[k]!==after[k]) console.log(`  MOVED  ${k}:  ${before[k]}  ->  ${after[k]}`); }
    console.log('  (everything not listed is identical)');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
