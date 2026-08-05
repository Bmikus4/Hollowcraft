// EVERY ON-SCREEN MESSAGE IS TYPED OUT (Ben's backlog item 39: "ALL on-screen messages: typewriter, slower, with click sounds; plus a
// 'Day N' label at every sunrise in the same style").
//
// flashName is the whole message channel — objectives, the Wretch's lines, pickups, deaths — so this measures IT rather than any one
// caller. "It is a typewriter" is a claim about the text GROWING: a single read at the end looks identical to the old instant write, so
// the element is sampled repeatedly and the lengths must increase and then stop at the full string.
//
// The clicks are not asserted. They go through `tone` on the ambient bus and a headless run has no audible output to measure; what IS
// checked is that typing a long line does not throw, which is the failure mode that matters (the audio graph is built far below
// flashName in the file, so an early message must not touch a bus that does not exist yet).
//
//   node bench/assert-message-typewriter.mjs
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
    await sleep(1200);
    // SHORT ENOUGH TO FINISH BEFORE THE GAME INTERRUPTS. A 47-character line takes about 2.8 s to reveal in a headless page and the
    // objective tracker flashed over it at 2.8 s on two runs, capping the observed peak at 43 of 47. The claim does not need a long line.
    const LINE='the wood remembers you';
    const first=await page.evaluate(`__hc.msgProbe(${JSON.stringify(LINE)})`);
    console.log('    first frame', JSON.stringify(first));
    ok('the line starts as one character, not all of it', first.text!=null && first.text.length===1, {text:first.text});
    ok('...and it is mid-reveal', first.typing===true, {typing:first.typing});
    const seen=[first.text.length];
    for(let i=0;i<24;i++){ await sleep(120); const r=await page.evaluate(`__hc.msgRead()`); seen.push((r.text||'').length); if(!r.typing) break; }
    console.log('    lengths over time', JSON.stringify(seen));
    // THE MAXIMUM, NOT THE LAST. The game is running while this samples and its own messages come through the same channel — an
    // objective flash landed mid-sequence on the first run and reset the length to 3, which is correct behaviour and looked like a bug.
    const peak=Math.max(...seen);
    ok('the text grows', peak > seen[0], {from:seen[0], peak});
    ok('...and reaches the whole line', peak===LINE.length, {peak, expected:LINE.length});
    // SLOWER: the reveal must take real time. A 47-character line at 34 ms a character cannot appear in one sample period.
    ok('it is revealed over many frames, not in one', seen.filter(v=>v>0&&v<LINE.length).length>=5, {steps:seen.length, seen});
    // A SECOND MESSAGE MID-REVEAL is normal play, and must not type over the tail of the first.
    await page.evaluate(`__hc.msgProbe('it comes for you')`);
    await sleep(140);
    const mid=await page.evaluate(`__hc.msgRead()`);
    console.log('    interrupted', JSON.stringify(mid));
    ok('a new message restarts from empty', mid.text.length<=6 && 'it comes for you'.startsWith(mid.text), {text:mid.text});
    // …and it fades on its own afterwards.
    await sleep(3600);
    const gone=await page.evaluate(`__hc.msgRead()`);
    console.log('    after the hold', JSON.stringify(gone));
    // OR THE CHANNEL CHANGED HANDS. The game flashes its own messages while this runs, and a fresh one legitimately resets the hold — so
    // "it faded" and "something else owns the line now" are both passes, and only a line still lit with our own text is a failure.
    ok('the message fades out when it is done', gone.opacity==='0' || gone.text!=='it comes for you', gone);
    // THE DAY LABEL, in the same channel.
    const day=await page.evaluate(`__hc.dayLabel()`);
    // POLLED UNTIL IT FINISHES TYPING. A fixed sleep read "D" and called it a failure: the label is typed like everything else, and a
    // headless page's timers do not run at the cadence a real one does.
    let dayRead=null;
    for(let i=0;i<20;i++){ await sleep(200); dayRead=await page.evaluate(`__hc.msgRead()`); if(!dayRead.typing) break; }
    console.log('    day label', JSON.stringify({day, dayRead}));
    ok('the sunrise label is a Day N in the same channel', /^Day \d+$/.test((dayRead.text||'').trim()) || /^Day/.test(day.shown||''), {shown:day.shown, text:dayRead.text});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
