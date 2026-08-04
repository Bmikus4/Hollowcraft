// THE THIRD NIGHT, AND THE CROSS THAT ENDS IT (Ben 08-04):
//   the Wretch turns into the Horrific Wretch on night 3 and every night after
//   the two never exist at once unless one was deliberately spawned
//   the changed one keeps the Wretch's own healthbar — the same hp object either side
//   showing it the monk's cross burns the cross away and turns it back
//   node bench/assert-wretch-nights.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0;
const ok=(name,cond,got)=>{ if(!cond)fails++; console.log(`  ${cond?'ok  ':'FAIL'}  ${name}   ${JSON.stringify(got)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(800);
    await page.evaluate(`__hc.summon()`);
    await sleep(1200);
    // Keep her ALIVE and nearby for the whole run: the checks are about one creature changing, so she has to be there to change.
    const hurt = await page.evaluate(`(()=>{ __hc.freeze(true,false); __hc.wretchAt(8); hurtWretch(700); return __hc.hwState(); })()`).catch(()=>null);
    console.log('    wounded to', hurt && hurt.prime && hurt.prime.hp);

    console.log('\n[1] nights one and two leave her alone');
    const n1 = await page.evaluate(`__hc.hwNight(0)`);
    ok('the first night does not change her', n1.prime.horrific===false, {day:n1.day, horrific:n1.prime.horrific});
    const n2 = await page.evaluate(`__hc.hwNight(1)`);
    ok('nor the second', n2.prime.horrific===false, {day:n2.day, horrific:n2.prime.horrific});

    console.log('\n[2] the third night, and every night after');
    const n3 = await page.evaluate(`__hc.hwNight(2)`);
    console.log('   ', JSON.stringify(n3));
    ok('night three turns her', n3.prime.horrific===true, {day:n3.day, horrific:n3.prime.horrific});
    ok('and she is the bigger form', n3.prime.scale>n1.prime.scale, {before:n1.prime.scale, after:n3.prime.scale});
    ok('it is still ONE creature', n3.creatures.length===1 && n3.creatures[0].prime===true, n3.creatures);
    ok('carrying the same health it had', n3.prime.hp===n2.prime.hp && n3.prime.hpMax===n2.prime.hpMax, {before:n2.prime.hp, after:n3.prime.hp, max:n3.prime.hpMax});
    const dawn = await page.evaluate(`__hc.hwDawn()`);
    ok('dawn gives her back', dawn.prime.horrific===false, {horrific:dawn.prime.horrific, uDay:dawn.uDay});
    const n5 = await page.evaluate(`__hc.hwNight(4)`);
    ok('and every night after does it again', n5.prime.horrific===true, {day:n5.day, horrific:n5.prime.horrific});

    console.log('\n[3] the monk cross');
    // Force the form and stand her in front of you: this section is about the cross, and hwNight restores the world clock on its
    // way out, so the next frame would honestly turn her back at dawn before the cross was ever raised.
    await page.evaluate(`(()=>{ __hc.hwForce(true); __hc.wretchAt(8); __hc.cam({pitch:0}); })()`);
    const cross = await page.evaluate(`__hc.crossShow()`);
    console.log('   ', JSON.stringify({result:cross.result, held:cross.held, before:cross.before.prime.horrific, after:cross.after.prime.horrific}));
    ok('showing it to her turns her back', cross.before.prime.horrific===true && cross.after.prime.horrific===false, {before:cross.before.prime.horrific, after:cross.after.prime.horrific});
    ok('the cross is spent', cross.held!=='monk_cross', {held:cross.held});
    ok('and her health is untouched by the change', cross.after.prime.hp===cross.before.prime.hp, {before:cross.before.prime.hp, after:cross.after.prime.hp});
    const noTarget = await page.evaluate(`__hc.crossShow()`);
    ok('with nothing to show it to, it is not consumed', noTarget.result.shown===false && noTarget.held==='monk_cross', {shown:noTarget.result.shown, held:noTarget.held});

    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`);
  console.log('RESULT: '+(fails?'FAIL':'PASS'));
  process.exit(fails?1:0);
})();
