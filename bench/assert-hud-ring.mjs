// THINNER BARS ROUND THE MINIMAP AND SLIGHTLY SMALLER ARMOUR SHIELDS (Ben 08-05).
//
// The four vitals rings were 9 px wide on a 13 px pitch; they are 6 on a 10, which keeps the same 4 px of daylight between them so
// four thinner rings still read as four rings rather than as lines adrift in a wide band. The shields went 12.5x15 -> 11x13.2.
//
// MEASURED IN PIXELS, not read off the constants. The minimap is a 2D canvas, so getImageData is exact — the probe walks a radial ray
// out from the ring's centre and reports every run of paint it crosses, and the run colours identify which ring is which. The bench
// then checks the picture against updateMinimap._geo, so a change that edits the constant but not the drawing (or the reverse) fails.
//
//   node bench/assert-hud-ring.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1500);
    await page.evaluate(`__hc.qaLocked(true)`);

    const r=await page.evaluate(`__hc.hudRing()`);
    if(r.err||r.no){ console.log('  probe failed', JSON.stringify(r)); process.exit(1); }
    console.log('    intent', JSON.stringify(r.intent));
    console.log('    canvas', JSON.stringify(r.canvas), 'z', r.z);
    for(const g of r.rings) console.log('      ring', JSON.stringify(g));
    console.log('    shield', JSON.stringify(r.shield));

    ok('the constants are the thinner pair', r.intent.ringW===6 && r.intent.ringPitch===10, r.intent);
    ok('four rings are actually painted', r.rings.length===4, {found:r.rings.length});

    // Each ring's DRAWN thickness. A round line cap adds nothing radially, so the stroke width is the run height; one pixel of
    // tolerance either way for the 1.25 backing-store sampling and the antialiased edge.
    const thick=r.rings.map(g=>g.thick);
    const badThick=thick.filter(t=>Math.abs(t-6)>1.6);
    ok('every painted ring is ~6 px thick, not 9', r.rings.length===4 && badThick.length===0, thick);

    // The pitch, straight out of the picture: consecutive inner edges 10 apart.
    const pitches=[]; for(let i=1;i<r.rings.length;i++) pitches.push(+(r.rings[i].rIn-r.rings[i-1].rIn).toFixed(2));
    const badPitch=pitches.filter(p=>Math.abs(p-10)>1.2);
    ok('the rings sit on a ~10 px pitch, not 13', pitches.length===3 && badPitch.length===0, pitches);

    // 4 px of air between rings is the thing that keeps four thin rings reading as four.
    const gaps=[]; for(let i=1;i<r.rings.length;i++) gaps.push(+(r.rings[i].rIn-r.rings[i-1].rOut).toFixed(2));
    ok('there is still daylight between every pair', gaps.length===3 && gaps.every(x=>x>1.5 && x<6.5), gaps);

    // The colours prove these are the four vitals in draw order and not four arbitrary strokes: deep sea blue, dark ochre, old
    // blood, then the stamina hue sweep at full green.
    const [w8,hu,he,st]=r.rings.map(g=>g.rgb);
    ok('inner ring is the water blue', !!w8 && w8[2]>w8[0] && w8[2]>90, w8);
    ok('second ring is the hunger ochre', !!hu && hu[0]>hu[2] && hu[1]>hu[2], hu);
    ok('third ring is the health red', !!he && he[0]>he[1]*1.8 && he[0]>he[2]*1.8, he);
    ok('outer ring is the stamina green', !!st && st[1]>st[0] && st[1]>st[2], st);

    // ---- THE SHIELDS ----
    ok('the shield constants are the smaller pair', r.intent.shieldW===11 && r.intent.shieldH===13.2, r.intent);
    ok('a shield is really painted', !!r.shield && r.shield.px>200, r.shield);
    // Drawn box = 2W x 2H plus the 1.6 rim straddling the edge, so ~23.6 x ~28. The old pair would measure ~26.6 x ~31.6.
    ok('the drawn shield is ~22x26.4 plus its rim, not the old 25x30', !!r.shield && Math.abs(r.shield.w-23.6)<2.2 && Math.abs(r.shield.h-28)<2.4, r.shield&&{w:r.shield.w,h:r.shield.h});
    ok('it is narrower than it is tall, as the shape was drawn', !!r.shield && r.shield.w < r.shield.h, r.shield&&{w:r.shield.w,h:r.shield.h});
    // The column follows the rings inward: shieldR is written as ring0+pitch*3+29.
    ok('the shield column followed the thinner rings inward', Math.abs(r.intent.shieldR-(r.intent.ring0+r.intent.ringPitch*3+29))<0.01 && r.intent.shieldR<208, {R:r.intent.shieldR});
    // And it still clears the outermost ring rather than sitting on it.
    const outerEdge=r.rings.length?r.rings[r.rings.length-1].rOut:0;
    ok('the shields still clear the outermost ring', r.intent.shieldR - outerEdge > 12, {shieldR:r.intent.shieldR, outerEdge});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
