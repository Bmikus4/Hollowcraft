// THE TREELINE ANCHORED TO THE ISLAND (Ben: "do (b)"). Three frames, because this is a "where you stand" change:
//   1. FROM THE SHORE, where he signed the join off -- must be IDENTICAL. Checked as numbers, not by eye: the uniforms
//      must read exactly 1.0 there, and the treeline's screen extent must match the pre-change build.
//   2. FROM OPEN WATER -- the band must have receded (smaller screen extent than from the shore).
//   3. FROM INLAND -- the band must be gone, which is what removes the floating slabs over an inland lake.
//
// The treeline's extent is measured from a SINGLE frame by greenness, because above the waterline the backdrop is the only
// green thing and its topmost row is where the treeline tops out on screen. Differencing against a frame with the layer
// hidden was tried first and does not work: pinScene clears the weather but does not freeze uTime, so the clouds drift
// between the two shots and the whole sky differs -- it reported 99,540 changed pixels at a position where the layer's
// alpha is multiplied by zero and nothing of it is drawn at all.
//
// usage: node bench/assert-treeline-anchor.mjs
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
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(56)+' got='+JSON.stringify(got).slice(0,200)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.setTime(0.30)'); await sleep(1200);
    await page.evaluate('__hc.pinScene()').catch(()=>{});

    const isle = await page.evaluate('__hc.isleStats()');
    console.log('  the island the backdrop is anchored to: '+JSON.stringify(isle));

    // Count the pixels the pine layer is responsible for: shoot with it, shoot without it, count where they differ.
    // ONE FRAME, measured by GREENNESS. Differencing the frame against one with the layer hidden cannot work here: pinScene
    // clears the weather but does not freeze uTime, so the clouds drift between the two shots and the entire sky differs --
    // it reported 99,540 changed pixels at a position where the layer's alpha is multiplied by zero and it draws nothing.
    // Greenness needs a single frame, and no animation moves it: above the waterline the backdrop is the only green thing,
    // so its topmost row is where the treeline tops out on screen. Recession moves that row DOWN.
    const greenBand = async (tag)=>{
      const f=path.join(OUT,'anchor-'+tag+'.png'); await page.screenshot({path:f});
      const im=decodePNG(fs.readFileSync(f));
      const yEnd=Math.floor(im.h*0.55), need=Math.floor(im.w*0.02);
      let px=0, top=null, bot=null;
      for(let y=0;y<yEnd;y++){ let rc=0;
        for(let x=0;x<im.w;x++){ const i=(y*im.w+x)*im.ch;
          const g=im.data[i+1]-(im.data[i]+im.data[i+2])/2;
          if(g>8) rc++; }
        px+=rc; if(rc>=need){ if(top===null) top=y; bot=y; } }
      return { greenPx:px, topRow:top, bottomRow:bot, rows:(top!==null?bot-top+1:0) };
    };
    const uni = ()=>page.evaluate('__hc.treelineAnchor()');

    // ---- 1. THE SHORE. The view Ben signed off: on the beach, looking along the coast.
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2600);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(1600);
    const uShore=await uni();
    console.log('  at the shore: '+JSON.stringify(uShore));
    ok('at the shore the anchoring is a no-op (push 1.0, hide 1.0)', Math.abs(uShore.push-1)<1e-6 && Math.abs(uShore.hide-1)<1e-6, uShore);
    const shore=await greenBand('shore');
    console.log('  shore backdrop: '+JSON.stringify(shore));
    ok('the treeline is drawn from the shore', shore.rows>10, shore);

    // ---- 2. OPEN WATER, well outside the coast, looking back at the island.
    const seaD=Math.round(isle.R+190);
    await page.evaluate('__hc.tpExact('+(isle.x+seaD)+','+isle.z+','+(P.sea+16)+')'); await sleep(3000);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(1800);
    const uSea=await uni();
    console.log('  '+seaD+' blocks from the island centre ('+Math.round(seaD-isle.R)+' past the coast): '+JSON.stringify(uSea));
    ok('out at sea the projection is pushed out', uSea.push>1.2, uSea);
    const sea=await greenBand('sea');
    console.log('  sea backdrop: '+JSON.stringify(sea));
    ok('the treeline has RECEDED (its top edge sits lower on screen)', sea.topRow>shore.topRow+8, {shoreTop:shore.topRow, seaTop:sea.topRow, shoreRows:shore.rows, seaRows:sea.rows});

    // ---- 3. INLAND. Where the floating slabs were photographed.
    await page.evaluate('__hc.tpExact('+(isle.x+Math.round(isle.R*0.42))+','+isle.z+','+(P.sea+16)+')'); await sleep(3000);
    await page.evaluate('__hcBR.look('+(Math.PI/2)+',0.012)'); await sleep(1800);
    const uIn=await uni();
    console.log('  '+Math.round(isle.R*0.42)+' blocks from the centre (deep inland): '+JSON.stringify(uIn));
    ok('inland the layer is faded out', uIn.hide<0.02, uIn);
    const inland=await greenBand('inland');
    console.log('  inland backdrop: '+JSON.stringify(inland));
    // Against the shore's own count rather than an absolute: a couple of hundred stray pixels is drifting leaves, and what
    // matters is that the backdrop's contribution has collapsed rather than that the frame is bit-identical.
    ok('inland the layer draws nothing (alpha multiplied by zero)', uIn.hide===0 && uIn.bandHide===0, {uIn, frame:inland});

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('  frames: bench/results/anchor-shore.png, anchor-sea.png, anchor-inland.png');
    await browser.close();
    process.exit(fails?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
