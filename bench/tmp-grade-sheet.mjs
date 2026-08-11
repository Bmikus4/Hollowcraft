// THE CONTACT SHEET FOR THE POST-PROCESSING PASS. Every candidate grade, at every vantage, in one page.
//
// A grade is chosen by eye and never by a statistic, so this harness does not compute anything: it renders the same
// four places under each candidate in __hc.gradePresets and writes an HTML sheet that puts them side by side. That is
// the whole deliverable — the decision is Ben's and this is the only form in which it can honestly be put to him.
//
// SAME FRAME, DIFFERENT GRADE, AND NOTHING ELSE. The clock is pinned, the scene is pinned, the HUD is off and the
// camera does not move between candidates, so two images in a row differ by the grade and by nothing else. The first
// version of this idea walked between shots and produced a sheet in which the sun had moved, which is a sheet nobody
// can read.
// THE SHIPPED LOOK IS RENDERED FIRST AND LAST at every vantage. If those two do not match, the sheet is measuring
// something other than the grade — a chunk that streamed in, a cloud that moved — and none of the rows between them
// can be trusted.
//
//   node bench/tmp-grade-sheet.mjs
//   open bench/results/grade-sheet.html
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// FOUR PLACES THAT DISAGREE WITH EACH OTHER. A grade that flatters the shore at golden hour and kills the wood at noon
// is not a grade, and one vantage cannot show that. Low sun over water, deep cover at noon, open ground, and night.
//
// EVERY ONE OF THEM ELEVATES AND PITCHES DOWN, and the first run of this sheet is why. `goShore()` on its own put the
// camera INSIDE the canopy and rendered four vantages of black-green leaf texels — twenty-four screenshots of nothing,
// and a sheet that would have been sent to Ben as a decision. This is a known trap in this repo and it is written down
// in three places; the fix is that the harness now checks rather than the author remembering.
const VANTAGES=[
  ['shore_gold',  `H.setTime(0.44); goShore(); { const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); } H.cam({yaw:0.7, pitch:-0.16});`],
  ['forest_noon', `H.setTime(0.25); goForest(); { const p=__hc.pos(); __hc.tpAt(p.x,p.y+14,p.z); } H.cam({yaw:0.7, pitch:-0.30});`],
  ['spawn_open',  `H.setTime(0.35); atSpawn();  { const p=__hc.pos(); __hc.tpAt(p.x,p.y+7,p.z); }  H.cam({yaw:Math.PI, pitch:-0.40});`],
  ['spawn_night', `H.setTime(0.85); atSpawn();  { const p=__hc.pos(); __hc.tpAt(p.x,p.y+7,p.z); }  H.cam({yaw:Math.PI, pitch:-0.30});`],
];
function frameStat(file){
  const P=decodePNG(fs.readFileSync(file)); const v=[];
  for(let y=0;y<P.h;y+=4) for(let x=0;x<P.w;x+=4){ const i=(y*P.w+x)*P.ch; v.push(0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]); }
  v.sort((a,b)=>a-b); const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { p10:q(0.10), p50:q(0.50), p90:q(0.90) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null; const sheet=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(HELPERS);
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cinema(true); __hc.freezeAnimals(true); __hc.holdNone();`);
    const NAMES=await page.evaluate(`Object.keys(__hc.gradePresets)`);
    const ORDER=[...NAMES,'shipped'];   // shipped first and last — see the header
    console.log(`  candidates: ${NAMES.join(', ')}`);
    for(const [vname, go] of VANTAGES){
      await page.evaluate(`(function(){ ${go} })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(3500);
      const row={ vantage:vname, shots:[] };
      for(let i=0;i<ORDER.length;i++){
        const g=ORDER[i];
        const st=await page.evaluate(`__hc.grade(${JSON.stringify(g)})`);
        await sleep(450);
        const tag=(i===ORDER.length-1)?'shipped_again':g;
        const file=`grade-${vname}-${tag}.png`;
        await page.screenshot({path:path.join(OUT,file)});
        row.shots.push({ name:tag, file, state:st });
        console.log(`    ${vname.padEnd(13)} ${tag.padEnd(14)} ${JSON.stringify(st)}`);
      }
      // IS THE CAMERA LOOKING AT ANYTHING. Read off the row's own first SCREENSHOT, not off the canvas: a WebGL canvas
      // drawn into a 2D context comes back pure black without preserveDrawingBuffer, and the first version of this guard
      // did exactly that and reported 0/0/0 for four vantages that were fine. A buried lens is caught by the SPREAD of
      // the frame rather than by its brightness, because a night vantage is legitimately dark and a frame with nothing
      // in it is legitimately uniform.
      // THE CONTROL, AS A NUMBER ON THE SHEET rather than as an instruction to squint. shipped and shipped_again are the
      // same grade; their difference is everything else that moved between the first shot and the last. Measured: 0.06
      // of 255 at the three land vantages and 1.66 at the shore, where animated sea fills half the frame.
      row.drift=+(frameStat(path.join(OUT,row.shots[row.shots.length-1].file)).p50 - frameStat(path.join(OUT,row.shots[0].file)).p50).toFixed(2);
      row.check=frameStat(path.join(OUT,row.shots[0].file));
      row.flat=(row.check.p90-row.check.p10)<12;
      console.log(`    ${vname.padEnd(13)} frame p10/p50/p90 ${row.check.p10}/${row.check.p50}/${row.check.p90}${row.flat?'   *** FLAT - the camera is probably inside something, do not read this row ***':''}`);
      sheet.push(row);
    }
    await page.evaluate(`__hc.grade('shipped')`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=`<!doctype html><meta charset="utf-8"><title>Hollowcraft — grade candidates</title>
<style>
 :root{color-scheme:dark}
 body{background:#0d0d0f;color:#d8d4cc;font:14px/1.5 "Cascadia Code",ui-monospace,monospace;margin:0;padding:28px}
 h1{font-size:18px;font-weight:600;letter-spacing:.04em;margin:0 0 6px}
 p.note{color:#8b867d;max-width:70ch;margin:0 0 28px}
 h2{font-size:15px;font-weight:600;margin:34px 0 10px;color:#d4af37}
 .row{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px}
 figure{margin:0;flex:0 0 auto;width:520px}
 figure img{width:100%;display:block;border:1px solid #26241f;border-radius:3px}
 figcaption{margin-top:6px;color:#b6b0a6}
 figcaption b{color:#e8e2d6}
 figcaption span{color:#7d786f}
 .last figcaption b{color:#8b867d}
</style>
<h1>Hollowcraft — post-processing candidates</h1>
<p class="note">Same frame, same clock, same camera; only the grade changes. <b>shipped</b> is rendered first and
<b>shipped_again</b> last at every vantage — if those two do not match, something other than the grade moved and the
row cannot be read. Load any of these live with <code>__hc.grade('name')</code>, or turn the individual dials with
<code>__hc.grade({sat,curve,vib,warm,temp,vig,grain,lift,gain})</code>.</p>
${sheet.map(r=>`<h2>${esc(r.vantage)}${r.flat?' <span style="color:#c05a4a">— FLAT FRAME, camera probably buried, do not read this row</span>':''} <span style="color:#7d786f;font-weight:400">control drift ${esc(r.drift)} of 255</span></h2><div class="row">${r.shots.map(s=>
  `<figure${s.name==='shipped_again'?' class="last"':''}><img src="${esc(s.file)}" alt="${esc(s.name)}">
   <figcaption><b>${esc(s.name)}</b><br><span>${esc(JSON.stringify(s.state).replace(/[{}"]/g,'').replace(/,/g,'  '))}</span></figcaption></figure>`).join('')}</div>`).join('\n')}
`;
  fs.writeFileSync(path.join(OUT,'grade-sheet.html'), html);
  console.log(`\n  sheet: bench/results/grade-sheet.html`);
})().catch(e=>{ console.error(e); process.exit(1); });
