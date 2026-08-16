// ARMOUR: BIG ENOUGH TO SIT ON THE BODY, AND TEXTURED — in all three forms.
//
// Ben, 08-16: "amke tunics/chestpieces bigger, texture them, texture all armor."
//
// THREE FORMS PER PIECE, because they are three separate dispatches and the tool-grip work already proved they can
// disagree silently: the WORN overlay on the body, the DROPPED/held model from itemModel, and the inventory icon.
// A piece can be right in one and wrong in the other two, and declaring it done off one view is how that happens.
//
// WHAT IS MEASURED, not eyeballed:
//   worn size   the overlay's own bounding box against the torso it is supposed to sit ON. A chestpiece narrower
//               than the body is inside it, which is exactly what "make them bigger" means.
//   mapped      how many of the piece's meshes carry a texture map. Flat vertex colour is what "texture them" is
//               asking to replace, and mapped/meshes is the number that says whether it happened.
//   dropped     _sigModel on itemModel(id) — `sprite:true` is an extruded 2D glyph, which is what most of this
//               armour still is on the ground and in your hands.
//
//   node bench/assert-armor.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const PIECES=['leather_helmet','leather_chestplate','leather_leggings','leather_boots',
              'iron_helmet','iron_chestplate','iron_leggings','iron_boots'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    // The third-person body has to EXIST before its overlays can be measured — armorProbe reads _tpsBody.
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.tps&&__hc.tps(true);`).catch(()=>{});
    await sleep(1200);
    let P0=await page.evaluate(`__hc.armorProbe()`);
    if(P0.err){ await page.evaluate(`__hc.cmdRun('/tps on')`).catch(()=>{}); await sleep(900); P0=await page.evaluate(`__hc.armorProbe()`); }
    check('the third-person body exists to measure armour on', !P0.err, P0.err||'ok');
    if(P0.err) throw new Error(P0.err);

    console.log('\n  piece                 worn size (x,y,z)      meshes mapped | dropped');
    console.log('  '+'-'.repeat(80));
    const rows=[];
    for(const id of PIECES){
      const A=await page.evaluate(`__hc.armorProbe('${id}')`);
      const sig=await page.evaluate(`__hc.toolSig('${id}')`);
      // The probe reports all four slots; the one that just changed is the one this piece occupies.
      const worn=(A.pieces||[]).filter(p=>p.worn);
      const p=worn.length?worn[worn.length-1]:null;
      const r={ id, size:p?p.size:null, meshes:p?p.meshes:0, mapped:p?p.mapped:0, sprite:!!(sig&&sig.sprite), tris:sig&&sig.tris };
      rows.push(r);
      console.log(`  ${id.padEnd(20)} ${JSON.stringify(r.size).padEnd(22)} ${String(r.meshes).padEnd(6)} ${String(r.mapped).padEnd(6)} | ${r.sprite?'SPRITE':'model'} ${r.tris}t`);
    }
    // ---- TEXTURED: every mesh of every piece carries a map ----
    const untex=rows.filter(r=>r.meshes>0 && r.mapped<r.meshes);
    check('EVERY WORN ARMOUR PIECE IS TEXTURED', untex.length===0, untex.map(r=>`${r.id} ${r.mapped}/${r.meshes}`).join(' ')||'all mapped');
    // ---- BIG ENOUGH: a chestpiece sits ON the torso, so it must be wider than the body it covers ----
    // The player body is about 0.60 wide at the chest. An overlay narrower than that is inside the mesh, which is
    // the "too small" Ben reported, and it is a number rather than an impression.
    const chest=rows.filter(r=>/chestplate/.test(r.id));
    for(const c of chest) check(`${c.id} sits ON the torso rather than inside it`, c.size && c.size[0]>=0.62, c.size?`width ${c.size[0]}`:'no size');
    // ---- THE DROPPED FORM IS A REAL OBJECT, not an extruded glyph ----
    const sprites=rows.filter(r=>r.sprite);
    check('every armour piece is a real object on the ground', sprites.length===0, sprites.map(r=>r.id).join(' ')||'all modelled');
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
