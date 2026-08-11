// Grip rake, measured: for every angled box in a gun model, where does its BOTTOM end sit in z?
// Muzzle is -z and the eye is +z, so a pistol grip's bottom end must have z GREATER than its top end.
//
// REWRITTEN 08-11, because the thing it used to measure no longer exists. Four of the five guns are now the model
// pack's (assets/models/guns, see buildGlbGun) and a pack gun has no authored grip BOX to read a rake off — its grip
// is a measured point on one welded mesh, declared as userData.gripAt. The claim underneath has not changed and is
// the one that matters: the hand must be told to hold the gun BEHIND the bore and BELOW it, because a grip point
// forward of the bore is what "the grips face backwards" looked like. So the box check still runs for whatever is
// still built from boxes (it would catch a regression in the procedural fallbacks and the minigun), and the point
// check runs for every gun in the game, pack or procedural.
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await sleep(2000);
    const rows = await page.evaluate(`__hc.gripRake()`);
    if(rows.err){ console.log('ERR',rows.err); process.exitCode=1; return; }
    console.log('gun'.padEnd(10)+'size'.padEnd(20)+'rx'.padStart(7)+'topZ'.padStart(10)+'botZ'.padStart(10)+'  rake');
    for(const r of rows) console.log(r.gun.padEnd(10)+r.size.padEnd(20)+String(r.rx).padStart(7)+String(r.topZ).padStart(10)+String(r.botZ).padStart(10)+'  '+r.rake);
    fs.writeFileSync(path.join(ROOT,'bench','results','grip-rake.json'), JSON.stringify(rows,null,2));
    // Every grip and stock WRIST, on all four guns. The shotgun's buttstock and recoil pad are excluded on purpose: their
    // +0.10 is comb drop (positive rx lowers the REAR end of a lengthwise box), not a rake, and flipping it would raise the butt.
    let bad=0;
    // (1) ANY angled box that is a grip still has to rake rearward. Nothing is required to exist here: this half of
    // the bench is a guard on box-built models, and it passes vacuously on a build where every gun is a pack model.
    for(const r of rows){
      if(r.rake==='FORWARD'){ console.log('FAIL '+r.gun+' '+r.size+' rakes FORWARD (topZ '+r.topZ+' botZ '+r.botZ+')'); bad++; }
    }
    console.log('  '+rows.length+' angled boxes measured, '+rows.filter(r=>r.rake==='REARWARD').length+' rearward');
    // (2) EVERY GUN'S DECLARED GRIP is behind the bore and below it. This is what attachGunHand solves the arm onto,
    // so it is the number that decides whether the hand looks like it is holding the weapon or pushing it away.
    const P=await page.evaluate(`__hc.modelPack()`);
    if(P.err){ console.log('FAIL modelPack probe: '+P.err); bad++; }
    else for(const g of P.guns){
      if(!g.gripAt){ console.log('FAIL '+g.id+' declares no gripAt'); bad++; continue; }
      const [gx,gy,gz]=g.gripAt;
      // BELOW THE BORE, not below zero. The scoped rifle hangs from its optic rather than its bore (see GLB_GUNS'
      // opticY), so its bore is not at y=0 and neither is anything measured from it; the flash sprite sits ON the
      // bore by construction, which makes it the honest reference for "below".
      const bore=(g.flashY!=null)?g.flashY:0;
      const okZ=gz>0.0, okY=gy<bore;
      console.log((okZ&&okY?'ok   ':'FAIL ')+g.id.padEnd(30)+' grip ['+gx+','+gy+','+gz+'] bore y '+bore+(g.glb?'  '+g.glb:'  procedural'));
      if(!(okZ&&okY)) bad++;
    }
    console.log(bad?('FAILED '+bad):'PASS every grip rakes rearward and every gun grips behind and below the bore');
    if(bad) process.exitCode=1;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
