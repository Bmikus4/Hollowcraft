// Grip rake, measured: for every angled box in a gun model, where does its BOTTOM end sit in z?
// Muzzle is -z and the eye is +z, so a pistol grip's bottom end must have z GREATER than its top end.
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
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:640,height:480}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await sleep(2000);
    const rows = await page.evaluate(`__hc.gripRake()`);
    if(rows.err){ console.log('ERR',rows.err); process.exitCode=1; return; }
    console.log('gun'.padEnd(10)+'size'.padEnd(20)+'rx'.padStart(7)+'topZ'.padStart(10)+'botZ'.padStart(10)+'  rake');
    for(const r of rows) console.log(r.gun.padEnd(10)+r.size.padEnd(20)+String(r.rx).padStart(7)+String(r.topZ).padStart(10)+String(r.botZ).padStart(10)+'  '+r.rake);
    fs.writeFileSync(path.join(ROOT,'bench','results','grip-rake.json'), JSON.stringify(rows,null,2));
    // Only the two PISTOL grips are asserted. The bolt rifle's and the shotgun's stock wrists still rake forward and Ben has
    // not asked for those, so listing them above is the report; failing on them would fail a bench for unrequested work.
    let bad=0;
    for(const want of [{gun:'revolver',size:'0.03x0.11x0.06'},{gun:'revolver',size:'0.026x0.07x0.03'},{gun:'ar15',size:'0.032x0.088x0.04'}]){
      const r=rows.find(x=>x.gun===want.gun&&x.size===want.size);
      if(!r){ console.log('FAIL missing '+want.gun+' '+want.size); bad++; continue; }
      if(r.rake!=='REARWARD'){ console.log('FAIL '+want.gun+' '+want.size+' rakes '+r.rake+' (topZ '+r.topZ+' botZ '+r.botZ+')'); bad++; }
      else console.log('ok   '+want.gun+' '+want.size+' rearward');
    }
    console.log(bad?('FAILED '+bad):'PASS 3/3 pistol grips rake rearward');
    if(bad) process.exitCode=1;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
