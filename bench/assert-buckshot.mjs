// BUCKSHOT IS A SHOTGUN SHELL, AND IT DOES NOT READ AS A RIFLE CARTRIDGE.
//
// Ben 08-04: it "looks like a brass rifle casing". It was: the item shared the 'bullet' icon painter with rifle_ammo and
// differed ONLY in the colour of the conical tip, so it was a brass rifle case with a red bullet in it. A real 12-gauge is
// mostly coloured plastic hull, straight-sided, with a short brass head about a third of the hull and a star crimp folded
// across the mouth.
//
// This matters beyond looks: the game refuses to feed the shotgun with rifle_ammo or the rifle with buckshot, so two
// ammo icons that read the same at hotbar size is a usability fault, not a cosmetic one.
//
// EVERY CLAIM IS A NUMBER READ FROM THE PIXELS, not a judgement about a picture:
//   the hull-to-brass ratio, how many of the 256 icon pixels differ from rifle_ammo, and the width of the topmost lit row
//   — a shell is square-topped and fat, a cartridge tapers to a point, and that silhouette is what separates them at 16px.
//
//   node bench/assert-buckshot.mjs
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
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await sleep(1500);

    const I=await page.evaluate('__hc.ammoIcons()');
    console.log('     '+JSON.stringify(I));

    // ---------- THE ICON IS A SHELL ----------
    check('the icon is mostly PLASTIC HULL, not brass', I.hullPx>I.brassPx, `${I.hullPx} hull px vs ${I.brassPx} brass px`);
    // ASSERT THE RATIO. Ben's number is a brass head about a third of the hull, so hull:brass lands near 3:1. "more hull
    // than brass" would pass on a shell that is 95% plastic with two stray brass pixels.
    check('the brass head is about a third of the hull', I.hullToBrass>=2.0 && I.hullToBrass<=4.5, `hull:brass ${I.hullToBrass}:1`);
    // THE SILHOUETTE, which is what the eye actually uses at hotbar size.
    check('the shell is SQUARE-TOPPED where the cartridge tapers to a point',
      I.topRowWidth>=5 && I.topRowWidth>I.rifleTopRowWidth, `shell top row ${I.topRowWidth}px vs cartridge ${I.rifleTopRowWidth}px`);

    // ---------- AND IT CANNOT BE CONFUSED WITH THE RIFLE ROUND ----------
    // The two used to differ by a tip colour alone. Requiring a large fraction of the lit area to differ is the check that
    // would have caught that: a recoloured copy differs in only a handful of pixels.
    check('the two ammo icons differ across most of their pixels, not just a tip colour',
      I.diffPixels>=40, `${I.diffPixels} of 256 pixels differ`);
    check('both icons actually drew something (the control)', I.litBuckshot>=30 && I.litRifle>=20,
      `buckshot ${I.litBuckshot} lit, rifle ${I.litRifle} lit`);

    // ---------- THE HELD AND DROPPED FORM IS A REAL SHELL ----------
    // Held and dropped, buckshot used to fall through to extrudeIcon — a flat extruded sprite, which cannot carry a primer
    // or a crimp because both live on the END faces.
    check('there is a real 3D shell for the hand and the ground', I.modelParts>=8, `${I.modelParts} meshes`);
    check('and it carries the six crimp folds plus hull, head, rim, primer and cap', I.modelParts>=11, `${I.modelParts} meshes (6 folds + 5 bodies = 11)`);
    check('its proportions are a 12-gauge, about 3.5 long to 1 wide',
      I.lenToDia>=2.4 && I.lenToDia<=4.2, `length ${I.modelLen} to diameter ${I.modelDia} = ${I.lenToDia}:1`);

    // ---------- AND THE HAND GETS IT TOO, WHICH IS A SEPARATE DISPATCH ----------
    // itemModel serves the drop, a peer's hand and the baked icon; setViewItem serves YOUR hands from its own list. The
    // held form stayed a flat extruded sprite after itemModel already returned a real shell, and only a screenshot showed
    // it. This check is what makes that scope measurable instead of a thing someone has to remember to look at.
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/give buckshot 8"); __hc.hold("buckshot"); })()');
    await sleep(1200);
    const H=await page.evaluate('__hc.heldParts()');
    console.log('     held: '+JSON.stringify(H));
    check('the HELD shell is the real model, not the extruded sprite', H.id==='buckshot' && H.meshes>=11,
      `held ${H.id} built from ${H.meshes} meshes (a sprite is 1)`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('hullToBrass and topRowWidth tell you whether the icon is still the shared bullet painter.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
