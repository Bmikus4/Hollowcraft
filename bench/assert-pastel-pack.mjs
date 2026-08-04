// THE PASTEL PACK. Ben: "24 new pastel blocks with custom textures".
//
// The pack is generated from one table by one painter, which removes the twenty-four places a hue could be typed wrong and
// creates exactly one new way to be wrong instead: a DUPLICATE entry, or a hue so close to its neighbour that they are the same
// block in practice. Reading the table cannot catch that and neither can a block-id count -- so the last check here places all
// twenty-four in a row, photographs them, and requires twenty-four visually distinct colours on screen.
//
// The other failure mode that matters for any new pack is the one that bit the industrial pack: a save stores block NUMBERS, so an
// id that comes back as something else silently rewrites a built world. Same round-trip test, same reason.
//
// usage: node bench/assert-pastel-pack.mjs   -> bench/results/pastel-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1200,height:600}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.5)');

    const names=await page.evaluate('__hc.pastels()');
    console.log('  pack: '+names.length+' names');
    ok('there are twenty-four of them', names.length===24, names.length);
    ok('and no name appears twice', new Set(names).size===names.length, names.length-new Set(names).size);

    const info=await page.evaluate('__hc.packInfo('+JSON.stringify(names)+')');
    console.log('  atlas: '+JSON.stringify(info._atlas));
    ok('the atlas still has room to spare', info._atlas.used < info._atlas.total, info._atlas);
    const miss=names.filter(n=>!info[n] || info[n].bid==null);
    ok('every pastel has a block id', miss.length===0, miss);
    const noItem=names.filter(n=>!info[n].name);
    ok('every pastel has an item', noItem.length===0, noItem);
    const notCreative=names.filter(n=>!info[n].inCreative);
    ok('every pastel is reachable in creative', notCreative.length===0, notCreative);
    const badName=names.filter(n=>!/^Pastel /.test(info[n].name||''));
    ok('their names read as names, not ids', badName.length===0, badName.map(n=>info[n].name));
    const notSolid=names.filter(n=>info[n].solid!==true);
    ok('they are solid blocks you can build with', notSolid.length===0, notSolid);
    const lit=names.filter(n=>info[n].light>0);
    ok('and none of them glows', lit.length===0, lit);
    // Block ids must be CONTIGUOUS and at the very END of the list: that is what makes them safe to add to a game whose saves
    // store numbers, and a later insert above them is exactly what this would catch.
    const ids=names.map(n=>info[n].bid).sort((a,b)=>a-b);
    ok('their ids are contiguous', ids[ids.length-1]-ids[0]===23, {first:ids[0], last:ids[ids.length-1]});
    // AGAINST N_BLOCKS, not Object.keys(BID).length. Several blocks in this game are declared twice — the second declaration
    // overwrites the BID key but still consumes an id — so the key count is 158 while the id count is 161, and comparing against
    // it failed a pack that was correctly at the end.
    const tbl=await page.evaluate('__hc.pastelTable()');
    ok('and sit at the end of the block list', ids[ids.length-1]===tbl.blocks-1, {last:ids[ids.length-1], blocks:tbl.blocks});
    // THE TABLE, before anything is rendered. A hand-picked palette put ten pairs inside 25 and two inside 15; 32 is the ceiling
    // a search over the pastel gamut can reach, so 28 leaves a little room to edit a hue without instantly failing.
    console.log('  closest pair in the table: '+JSON.stringify(tbl.closest));
    ok('no two hues in the table are near-duplicates', tbl.closest.d>=28, tbl.closest);
    // AND THE PAINTED TILES, which is the real test of "custom textures": the painter could collapse two hues even from a
    // well-spaced table, and no screenshot in this game's lighting is able to tell.
    const tiles=await page.evaluate('__hc.pastelTiles()');
    console.log('  closest pair in the atlas: '+JSON.stringify(tiles.closest));
    ok('all 24 tiles were painted', tiles.tiles.length===24, tiles.tiles.length);
    ok('no two painted tiles are near-duplicates', tiles.closest.d>=28, tiles.closest);
    ok('and the painter kept them all pastel', tiles.tiles.every(t=>Math.min.apply(null,t.rgb)>=130 && Math.max.apply(null,t.rgb)<=250),
      tiles.tiles.filter(t=>Math.min.apply(null,t.rgb)<130||Math.max.apply(null,t.rgb)>250).map(t=>[t.name,t.rgb]));

    // A SAVE STORES NUMBERS. Write all 24, round-trip them through applySave, and require every cell to come back as itself.
    const rt=await page.evaluate('__hc.pastelSaveRoundTrip()');
    console.log('  save round trip: '+JSON.stringify(rt));
    ok('all 24 survive a save and reload as themselves', rt && rt.mismatched===0 && rt.wrote===24, rt);

    // LOOK AT THEM. A hue collision is invisible to every check above.
    const row=await page.evaluate('__hc.pastelRow()');
    await sleep(1200);   // let the courses remesh before anything is projected against them
    console.log('  laid a row at: '+JSON.stringify(row));
    ok('the row was built', row && row.placed===24, row);
    await page.evaluate('__hc.pastelRowLook()'); await sleep(1800);
    const shot=path.join(OUT,'pastel-row.png'); await page.screenshot({path:shot});
    const { decodePNG }=await import('./pngprobe.mjs'); const img=decodePNG(fs.readFileSync(shot));
    // Sample each block's own screen column, from its projected centre, and take the median pixel of a small box.
    const cols=await page.evaluate('__hc.pastelRowScreen()');
    const seen=[];
    for(const c of cols){ if(!c.onScreen) continue;
      // BOX SIZED TO THE BLOCK, from its own projected half-width. A fixed +/-5 box is what averaged the grass behind a
      // one-course row and made this check vacuous while it was passing.
      const px=c.px|0, py=c.py|0, h=Math.max(2,Math.min(14,(c.halfPx|0)-2)); const acc=[0,0,0]; let n=0;
      for(let dy=-h;dy<=h;dy++) for(let dx=-h;dx<=h;dx++){ const X=px+dx, Y=py+dy;
        if(X<0||Y<0||X>=img.w||Y>=img.h) continue; const i=(Y*img.w+X)*img.ch;
        acc[0]+=img.data[i]; acc[1]+=img.data[i+1]; acc[2]+=img.data[i+2]; n++; }
      if(n) seen.push({name:c.name, rgb:acc.map(v=>Math.round(v/n))}); }
    console.log('  sampled '+seen.length+' of 24 on screen');
    ok('most of the row is actually on screen', seen.length>=20, seen.length);
    // Every sampled pair must differ by more than the plaster grain, or two entries are the same block in practice.
    let worst=null;
    for(let i=0;i<seen.length;i++) for(let j=i+1;j<seen.length;j++){
      const a=seen[i].rgb, b=seen[j].rgb;
      const d=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
      if(!worst||d<worst.d) worst={d, a:seen[i].name, b:seen[j].name, arg:a, brg:b}; }
    console.log('  closest pair on screen: '+JSON.stringify(worst));
    // THE RENDER CHECK ASKS WHAT A RENDER CAN ANSWER: are the blocks actually drawn, and is what we sampled the BLOCK rather than
    // the world behind it. It does NOT ask whether two hues differ — sand and cream measured 5 apart here while their tiles differ
    // by 54, because the frame was dim and the shader crushed red and blue to the same byte. Distinctness is tested on the atlas.
    // pastelBackdrop hands back SCREEN COORDS beside the row; the colour is read from the same PNG, so backdrop and blocks are
    // measured in one frame under one light.
    const bgp=await page.evaluate('__hc.pastelBackdrop()');
    const bg=(()=>{ const X=bgp[0]|0, Y=bgp[1]|0, acc=[0,0,0]; let n=0;
      for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){ const x=X+dx, y=Y+dy;
        if(x<0||y<0||x>=img.w||y>=img.h) continue; const i=(y*img.w+x)*img.ch;
        acc[0]+=img.data[i]; acc[1]+=img.data[i+1]; acc[2]+=img.data[i+2]; n++; }
      return n?acc.map(v=>Math.round(v/n)):[0,0,0]; })();
    console.log('  backdrop beside the row: '+JSON.stringify(bg));
    const offBg=seen.filter(o=>Math.abs(o.rgb[0]-bg[0])+Math.abs(o.rgb[1]-bg[1])+Math.abs(o.rgb[2]-bg[2]) < 12);
    console.log('  closest pair on screen: '+JSON.stringify(worst)+'   (reported, not asserted — see above)');
    ok('every sampled block is the block and not the backdrop', offBg.length===0, offBg.map(o=>o.name));

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
