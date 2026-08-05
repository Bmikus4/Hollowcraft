// A MONK KEEPS HIS HEAD WHEN IT GRAZES A BLOCK, AND LOSES IT WHEN IT IS INSIDE ONE (Ben 08-05: "monk's head disappears when it
// intersects geometry"). The creature-clip pass hides any part small enough that one buried bounding-box corner means most of it
// is in the wall — right for a hand or a boot, wrong for a head: the head, beard, kalimavkion and veil are seven separate meshes
// that each answered alone, so a skull grazing a doorframe left a hat and a beard hanging over an empty collar.
// Three states, measured through __hc.monkClip: clear air, one corner in a block, and the whole head walled in.
//   node bench/assert-monk-head-clip.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const W=900,H=600;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); })()`); await sleep(600);
    // Spawn him so his head straddles a cell boundary in x: the offset is chosen from the player's own fractional position.
    const sp=await page.evaluate(`(()=>{ const p=__hc.probe(); const want=Math.floor(p.x)+3; const dx=(want+0.02)-p.x; return __hc.monkSpawn(dx,0); })()`);
    console.log('    spawned', JSON.stringify(sp));
    await page.evaluate(`__hc.monkPark()`); await sleep(700);
    ok('a monk is standing there', sp && sp.y!=null, sp);
    // The clip pass runs one rig per frame, round-robin, so every read forces it rather than waiting its turn.
    const read=async()=>{ const r=await page.evaluate(`__hc.monkClip(true)`); await sleep(120); return r; };
    const clear=await read();
    console.log('    clear air', JSON.stringify(clear).slice(0,300));
    ok('in the clear, nothing of him is hidden', clear.hidden===0 && clear.headVisible===true, {hidden:clear.hidden, headVisible:clear.headVisible});
    // Seven parts from the collar up: head, beard, two eyes, kalimavkion, its crown, the veil — plus the hat cross's own boxes.
    // The threshold in the builder is 0.90 of the MONK'S SCALE, so a bench comparing raw heights counts the arms and the pectoral
    // cross in as well; what matters is that the head is flagged and the flagged set is the head assembly.
    ok('the head assembly is flagged as one silhouette', clear.headCentreOnly===true && clear.centreOnlyParts>=6, {headCentreOnly:clear.headCentreOnly, flagged:clear.centreOnlyParts});
    // A GRAZE, AND IT HAS TO REALLY GRAZE. The head is ~0.32 wide on the ground and a monk standing mid-cell has his whole head
    // inside one column — the first version of this placed its "grazing" block in the next cell along, never touched him, and
    // passed. So the monk is spawned straddling a cell boundary and the block goes in the column his head hangs over, which is
    // asserted rather than assumed.
    const graze=await page.evaluate(`(()=>{ const c=__hc.monkClip(), p=__hc.probe();
        const h=c.headAt.at, hw=c.headAt.half[0];
        const own=Math.floor(h[0]), side=Math.floor(h[0]-hw);          // the column the head's -x face hangs into
        const my=Math.floor(h[1]);
        if(side!==own) __hc.setBlock(side-Math.floor(p.x), my-Math.floor(p.y), Math.floor(h[2])-Math.floor(p.z), 'stone');
        return { head:h, halfW:hw, own, side, straddles:side!==own, overlap:+(own-(h[0]-hw)).toFixed(3), my }; })()`);
    console.log('    graze setup', JSON.stringify(graze));
    ok('the monk is straddling a boundary, so the block really cuts his head', graze.straddles===true && graze.overlap>0.04, graze);
    await sleep(500);
    const g1=await read();
    console.log('    grazed', JSON.stringify({hidden:g1.hidden, headVisible:g1.headVisible, headClipped:g1.headClipped}));
    ok('a graze does not take his head', g1.headVisible===true && g1.headClipped===false, {headVisible:g1.headVisible, headClipped:g1.headClipped});
    // Not the hat, the beard, the eyes or the veil either — the seven meshes of the head answer as one now. A LIMB with a corner
    // in the stone is expected to go: that is the eager rule this change deliberately leaves alone.
    ok('…nor the hat, beard, eyes or veil on their own', g1.hiddenFlagged===0, {hiddenFlagged:g1.hiddenFlagged, hiddenLimbs:g1.hiddenLimbs});
    // WALLED IN: fill the head's own cell and the one above it, so the centre test is satisfied — that IS a head inside the world,
    // and it should go. Otherwise this test would pass with the clip pass switched off entirely.
    const wall=await page.evaluate(`(()=>{ const c=__hc.monkClip(); const p=__hc.probe();
        const h=c.headAt.at;
        const mx=Math.floor(h[0]), my=Math.floor(h[1]), mz=Math.floor(h[2]);
        for(const dy of [0,1]) __hc.setBlock(mx-Math.floor(p.x), my+dy-Math.floor(p.y), mz-Math.floor(p.z), 'stone');
        return {mx,my,mz,head:h}; })()`);
    console.log('    walled in at', JSON.stringify(wall));
    await sleep(500);
    const g2=await read();
    console.log('    walled', JSON.stringify({hidden:g2.hidden, headVisible:g2.headVisible, headClipped:g2.headClipped}));
    ok('a head genuinely inside a block still goes', g2.headClipped===true && g2.headVisible===false, {headVisible:g2.headVisible, headClipped:g2.headClipped});
    ok('…and it takes the rest of the head with it', g2.hiddenFlagged>=5, {hiddenFlagged:g2.hiddenFlagged});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
