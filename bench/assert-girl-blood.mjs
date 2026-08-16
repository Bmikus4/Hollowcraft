// DOES THE GIANTESS BLEED ON HER OWN SKIN, AT A SIZE THAT IS NOT A CRATER? Three things Ben reported on 08-12 and
// none of them are visible to the existing blood bench, which only checks that the PNGs decode:
//   1. the wound quad was 60 cm on a thirteen-block body ("wayy too big")
//   2. the hole had no dark bottom, so on pale skin it read as a smear
//   3. the marks were not on her body at all — the surface snap missed, because a four-block back-out from a hit
//      point deep inside her torso still starts the ray INSIDE her, and a ray inside front-facing geometry crosses
//      no front face on the way out.
// So this shoots real rounds through girlRayHit at several bones and measures every wound against her posed skin.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,250)); console.log('PAGEERROR:',String(e.message||e).slice(0,250)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.waitForFunction(`(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.evaluate(`__hc.cmdRun('/gamemode creative'); __hc.girl(14)`);
    await page.waitForFunction(`(()=>{try{return __hc.girlState().active===true;}catch(e){return false;}})()`,null,{timeout:60000});
    await page.evaluate(`__hc.girlIdle&&__hc.girlIdle(30)`);
    await sleep(1200);

    // Shoot bones spread over the body: torso (deepest — the case the four-block back-out failed on), a thigh, an
    // upper arm, the head.
    const PARTS=['spine.003','thigh.L','upper_arm.R','Head'];
    for(const p of PARTS){ const r=await page.evaluate(`__hc.girlShoot(${JSON.stringify(p)},1)`); console.log('shoot',p,JSON.stringify(r)); }
    await sleep(600);
    const w = await page.evaluate(`__hc.girlWounds()`);
    console.log('girlWounds', JSON.stringify(w));

    T('a wound was made for every shot', w.marks>=PARTS.length, {marks:w.marks, n:w.n});
    T('the surface snap hit her skin', w.snap && w.snap.hit===true, w.snap);
    T('the snap read her POSED skin (skinned mesh)', !!(w.snap&&w.snap.skinned), w.snap);
    T('every mark lies ON her skin', w.offSkin===0, {offSkin:w.offSkin, gaps:w.wounds.filter(x=>x.kind==='mark').map(x=>x.gap)});
    T('marks are Ben 2.5x size — 60-80 cm on a 13.5-block body', w.maxW>=0.55 && w.maxW<=0.80, {maxW:w.maxW});
    T('the hole has a dark backing quad', w.marks>=PARTS.length*2, {marks:w.marks});
    T('the drips lie on her too', w.offSkinAll===0, {offSkinAll:w.offSkinAll, drips:w.wounds.filter(x=>x.kind==='drip').map(x=>x.gap)});

    // AND THEY HAVE TO STAY THERE WHILE SHE MOVES (Ben 08-12: "some jump around as she moves"). A decal parented to
    // the bone the hit TEST named rides a rigid frame the skin under it does not follow, so the error only shows up
    // once she is animating. Let her walk, then measure the same wounds again.
    await page.evaluate(`__hc.girlIdle&&__hc.girlIdle(0)`);
    await sleep(4000);
    const w2 = await page.evaluate(`__hc.girlWounds()`);
    console.log('girlWounds after walking', JSON.stringify(w2));
    T('every mark is still on her skin after she walks', w2.offSkin===0,
      {offSkin:w2.offSkin, gaps:w2.wounds.filter(x=>x.kind==='mark').map(x=>x.gap)});
    T('every drip is still on her skin after she walks', w2.offSkinAll===0,
      {offSkinAll:w2.offSkinAll, drips:w2.wounds.filter(x=>x.kind==='drip').map(x=>x.gap)});
    T('every wound is nailed to a triangle of skin', w2.wounds.every(x=>x.bound), w2.wounds.map(x=>x.bound));

    // AND WHEN SHE GOES DOWN SHE HAS TO BE ON THE FLOOR (Ben 08-12: "when the giantess dies shes slightly floating
    // off the ground"). The gap is measured from her lowest posed VERTEX, because a bone sits inside the flesh and
    // resting a bone on the ground needs a guessed limb radius — which is what the float was.
    await page.evaluate(`__hc.girlShoot('Head',20)`);
    await sleep(3500);
    const f = await page.evaluate(`__hc.girlFloat()`);
    console.log('girlFloat', JSON.stringify(f));
    T('she is dead', f.state==='die'||f.state==='dead', {state:f.state});
    T('her body rests on the ground, not above it', Math.abs(f.gap)<0.12, f);

    // and it has to LOOK like a hole: stand off and photograph her.
    await sleep(300);
    await page.screenshot({ path: path.join(OUT,'girl-blood.png') });
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
