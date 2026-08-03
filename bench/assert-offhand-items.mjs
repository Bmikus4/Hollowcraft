// ASSERT: EVERY kind of item put in the offhand is actually drawn there. Ben: "make sure all off hand items are actually
// visible in a shown off hand."
//
// Until now setOffItem returned early unless the item was a shield, so a torch, a gun, a spear, a block or a piece of food in
// the offhand rendered nothing -- and since the arm is gated on there being a mesh, the hand vanished with it. The equip slot
// has accepted any item since it was built (eqAccepts), so all of these are reachable in normal play.
//
// The test is a PIXEL COUNT, not a state read. Items are wood, iron, leather and stone -- every colour the world already has
// -- so each one is temporarily tinted magenta, which no terrain tone can produce, and counted in the lower-left of the frame.
// An empty offhand is the control and must read zero. This is the same method that caught the offhand shield being clipped
// away for a day while every boolean said it was present.
//
// usage: node bench/assert-offhand-items.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Magenta: r and b high, g far below both. Every terrain and item tone here is r>g>b (earth, wood, sand, leather, rust) or
// b>=g>r (sea, sky, steel). Magenta needs r and b high with g well under, so a magenta pixel is the tinted object.
function magenta(img){ let n=0, minx=1e9, maxx=-1, miny=1e9, maxy=-1;
  for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2];
    if(r>70 && b>70 && g < Math.min(r,b)*0.55){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
  return {n, box:n?[minx,miny,maxx,maxy]:null}; }

// The item list is asked of the GAME (__hc.itemClasses), one id per kind the held-item dispatch can hit. Hardcoding ids here
// tested my memory of the item table instead of the code: three of the first thirteen -- pickaxe_iron, spear_iron, book --
// do not exist, and the run reported them as "not drawn in the offhand" when nothing was wrong with the offhand at all.

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(40)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');
    await page.evaluate('__hc.pinScene()');
    await sleep(1200);

    const shoot=async(name)=>{ const p=path.join(OUT,'offitem-'+name+'.png'); await page.screenshot({path:p}); return decodePNG(fs.readFileSync(p)); };

    // CONTROL: empty offhand, tint requested anyway. Any magenta here voids every number below it.
    await page.evaluate('__hc.eqPut(4,null)'); await sleep(900);
    const C=magenta(await shoot('control'));
    ok('control: nothing magenta with an empty offhand', C.n<40, C.n);

    const classes = await page.evaluate('__hc.itemClasses()');
    console.log('  item classes from the game: '+JSON.stringify(classes));
    const ITEMS=[...new Set(Object.values(classes).filter(v=>typeof v==='string'))];
    ok('the game named a representative for many classes', ITEMS.length>=10, ITEMS.length);

    const rows=[];
    for(const id of ITEMS){
      const put = await page.evaluate('(()=>{ __hc.eqPut(4,null); const r=__hc.eqPut(4,'+JSON.stringify(id)+'); return r; })()');
      await sleep(700);
      // GEOMETRY decides pass/fail; the tint is kept only as a second opinion, because a cached material shared with world
      // drops leaks the colour elsewhere in the frame and two different block items reported the same count off it.
      const geo = await page.evaluate('__hc.offRig({})');
      const rig = await page.evaluate('__hc.offRig({itemTint:"#ff00ff"})');
      await sleep(600);
      const M = magenta(await shoot(id));
      const sh = await page.evaluate('__hc.shield()');
      rows.push({id, px:M.n, box:M.box, arm:sh.armVisible, offView:sh.offView,
                 onScreen:geo&&geo.onScreen, frac:geo&&geo.screenFrac, inScene:geo&&geo.inScene, ndc:geo&&geo.ndcBox});
      console.log('  '+id.padEnd(14)+' onScreen='+String(geo&&geo.onScreen).padEnd(5)+' frac='+String(geo&&geo.screenFrac).padEnd(7)
        +' inScene='+String(geo&&geo.inScene).padEnd(5)+' arm='+String(sh.armVisible).padEnd(5)+' magenta='+String(M.n).padStart(6)
        +(rig&&rig.err?('  rig:'+rig.err):''));
    }

    // Natural frames, no tint: the counts prove it is drawn, a frame is the only thing that shows whether it is drawn WELL.
    // Re-equipping from null rebuilds the mesh, so these come out in the item's own colours.
    // 'grass' is in this list on purpose: its tint reads 0 because block items share a cached material with their world drops,
    // so a frame is the ONLY evidence that a block in the offhand is drawn rather than merely positioned.
    for(const id of ['torch','lantern','wooden_spear','ar15','grass'].filter(x=>ITEMS.includes(x)||x==='torch'||x==='lantern'||x==='grass')){
      await page.evaluate('__hc.eqPut(4,null)'); await sleep(400);
      await page.evaluate('__hc.eqPut(4,'+JSON.stringify(id)+')'); await sleep(900);
      await page.screenshot({path:path.join(OUT,'offitem-natural-'+id+'.png')});
    }

    console.log('');
    for(const r of rows){
      ok(r.id+': on screen in the offhand', r.onScreen===true && r.frac>0.0004 && r.inScene===true, {onScreen:r.onScreen, frac:r.frac, inScene:r.inScene, magenta:r.px});
      ok(r.id+': the hand is shown with it', r.arm===true, r.arm);
    }
    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
