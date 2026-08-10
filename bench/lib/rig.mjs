// ONE RIG FOR EVERY LIGHTING HARNESS IN THE 08-06 PASS.
//
// Every assert-*.mjs in bench/ re-implements the same forty lines: freePort, spawn server.js, waitHttp, find Chrome,
// launch, wait for __hc, wait for the loader, unlock the pointer, screenshot, decode. That duplication is why the traps
// in docs/LIGHT-AND-BEAUTY-PLAN.md §7 keep being re-paid one harness at a time — a fix to the grain trap in one file
// does not reach the next one written. This module owns them once:
//
//   · GRAIN OFF BEFORE THE MODULE RUNS. The composer reads localStorage at build time, so setting it after boot does
//     nothing and two frames of the same scene then differ across a sixth of the screen (§7).
//   · THE CLOCK KEEPS RUNNING. pin() is called again immediately before every single shot, never once per condition.
//   · MEDIAN OF THREE. A single frame straight after a dial change can be a whole-frame black transient (§6 of the
//     08-06 note). shots() takes three and the stat functions reduce by median, per crop, per channel.
//   · ONE BOOT PER CONDITION IS THE CALLER'S JOB, and it matters: the sea benches are contaminated for the rest of a
//     session after uBody is raised (§6). This module makes a fresh boot cheap enough that there is no excuse.
//
// Deliberately NOT a test framework. It returns numbers; the harness decides what they mean and prints the spread
// rather than a verdict (bench/README.md).
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from '../pngprobe.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..', '..');
export const OUT  = path.join(ROOT, 'bench', 'results');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){
  for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'])
    if(fs.existsSync(p)) return p;
  throw new Error('no browser');
}

// ---- BOOT ----------------------------------------------------------------------------------------------------
// query: extra URL query string, e.g. 'dbg=sky' or 'nomblur=1'. debug=1&rd=8 are always on — every measurement in
// this pass is quoted at rd 8, and the census numbers in the plan are taken there.
export async function openWorld(opts={}){
  const { query='', w=1000, h=560, rd=8, creative=true, quality=null, timeout=240000, quiet=false } = opts;
  if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'server.js')], { cwd:ROOT, env:{...process.env, PORT:String(port), NO_OPEN:'1'}, stdio:'ignore' });
  const base = 'http://127.0.0.1:'+port;
  let browser=null;
  try{
    await waitHttp(base+'/index.html');
    browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
    const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
    // BEFORE the module runs — see the note at the top of this file.
    await ctx.addInitScript(([q])=>{ try{ localStorage.setItem('hollowcraft_grain','0'); if(q) localStorage.setItem('hollowcraft_q',q); }catch(e){} }, [quality]);
    const page = await ctx.newPage();
    const errors=[];
    page.on('pageerror', e=>{ const m=String(e.message||e); errors.push(m); if(!quiet) console.log('  PAGEERROR:', m.slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd='+rd+(query?'&'+query:''), { waitUntil:'load', timeout:120000 });
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout});
    await page.evaluate(`__hc.lock(true); __hc.pinScene();`);
    if(creative) await page.evaluate(`__hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    await sleep(300);
    const W = {
      page, browser, base, errors,
      close: async ()=>{ try{ await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} },
      ev: (js)=>page.evaluate(js),
    };
    return W;
  }catch(e){ try{ if(browser) await browser.close(); }catch(_){} try{ server.kill(); }catch(_){} throw e; }
}

// ---- CLOCK ---------------------------------------------------------------------------------------------------
// 0 = SUNRISE, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. Set TWICE with a settle between: one call lets the frame
// after it render on the old sun while the shadow map catches up on its own cadence.
export async function pin(W, t){
  await W.page.evaluate(`__hc.setTime(${t})`); await sleep(420);
  await W.page.evaluate(`__hc.setTime(${t})`); await sleep(180);
  return W.page.evaluate(`__hc.sunDir&&__hc.sunDir()`);
}

// ---- SHOTS ---------------------------------------------------------------------------------------------------
// n frames of the SAME condition, with the clock re-pinned before each one. Returns file paths.
export async function shots(W, tag, t=null, n=3){
  const files=[];
  for(let i=0;i<n;i++){
    if(t!=null) await W.page.evaluate(`__hc.setTime(${t})`);
    await sleep(140);
    const f = path.join(OUT, `${tag}-${i}.png`);
    await W.page.screenshot({path:f});
    files.push(f);
  }
  return files;
}

// ---- PIXEL STATISTICS ----------------------------------------------------------------------------------------
// A crop is [x0,x1,y0,y1] in FRACTIONS of the frame. Every statistic that a lighting claim in this pass rests on is
// here, so a harness cannot quietly use a different definition of "black" from its neighbour.
//
//   minCh   — THE COUNTER-METRIC TO LUMA. The scotopic wash is luminance-preserving by construction, so a luma
//             statistic reads a fully washed mid-grey cave as "not dark" (see _scotH's note in index.html). The
//             mean of the per-pixel MINIMUM channel is what actually falls when a surface goes black.
//   sat     — max-min over max, the chroma-collapse metric the night-hash bug was diagnosed with.
//   blackPct/nearBlackPct — pure zero, and under 8 of 255. Pure zero is a discard or a NaN; near-black is a shade.
export function statFile(file, c){
  const P = decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,(P.w*c[0])|0), x1=Math.min(P.w,(P.w*c[1])|0), y0=Math.max(0,(P.h*c[2])|0), y1=Math.min(P.h,(P.h*c[3])|0);
  let R=0,G=0,B=0,n=0,mn=0,sat=0,black=0,near=0; const v=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(y*P.w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    R+=r; G+=g; B+=b; n++;
    const lo=Math.min(r,Math.min(g,b)), hi=Math.max(r,Math.max(g,b));
    mn+=lo; sat += hi>0 ? (hi-lo)/hi : 0;
    if(r===0&&g===0&&b===0) black++;
    const l=0.2126*r+0.7152*g+0.0722*b; if(l<8) near++;
    v.push(l);
  }
  if(!n) return null;
  v.sort((a,b)=>a-b);
  const q = f => +v[Math.min(n-1, Math.max(0, Math.round(f*(n-1))))].toFixed(2);
  return { n, rgb:[+(R/n).toFixed(2),+(G/n).toFixed(2),+(B/n).toFixed(2)],
           lum:+(v.reduce((a,b)=>a+b,0)/n).toFixed(2), med:q(0.5), p10:q(0.10), p90:q(0.90), min:q(0), max:q(1),
           minCh:+(mn/n).toFixed(2), sat:+(sat/n).toFixed(4),
           blackPct:+(100*black/n).toFixed(3), nearBlackPct:+(100*near/n).toFixed(3) };
}

// ---- PAIRED IMAGE DIFFERENCE ----
// For an effect that changes a surface's SHAPE rather than its brightness — a normal perturbation, a ripple, a streak —
// every summary statistic is nearly blind: the mean, the median and the percentile span can all sit still while every
// pixel in the crop moves. The honest measure is how far the pixels actually moved, against a CONTROL PAIR of two
// frames of the same condition, which is what says how much of it was the effect and how much was the frame's own
// noise. This is assert-ssao's pattern; it exists because four separate confounds each looked like a broken pass.
export function diffStat(fileA, fileB, c){
  const A=decodePNG(fs.readFileSync(fileA)), B=decodePNG(fs.readFileSync(fileB));
  if(A.w!==B.w||A.h!==B.h) return null;
  const x0=(A.w*c[0])|0, x1=(A.w*c[1])|0, y0=(A.h*c[2])|0, y1=(A.h*c[3])|0;
  let sum=0, n=0, moved=0, mx=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(y*A.w+x)*A.ch;
    const d=(Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]))/3;
    sum+=d; n++; if(d>2) moved++; if(d>mx) mx=d;
  }
  return { mad:+(sum/n).toFixed(3), movedPct:+(100*moved/n).toFixed(2), max:+mx.toFixed(1) };
}

// Median across the N shots of the same condition, field by field. Arrays (rgb) are reduced element-wise.
export function statMedian(files, c){
  const S = files.map(f=>statFile(f,c)).filter(Boolean);
  if(!S.length) return null;
  const med = a => { const b=[...a].sort((x,y)=>x-y); return b[b.length>>1]; };
  const out={};
  for(const k of Object.keys(S[0])){
    if(Array.isArray(S[0][k])) out[k] = S[0][k].map((_,i)=>+med(S.map(s=>s[k][i])).toFixed(2));
    else out[k] = +med(S.map(s=>s[k])).toFixed(3);
  }
  return out;
}

// The whole convenience path: pin, three shots, median stats over a named crop set.
export async function measure(W, tag, t, crops, n=3){
  const files = await shots(W, tag, t, n);
  const out={};
  for(const [name,c] of Object.entries(crops)) out[name] = statMedian(files, c);
  return { files, ...out };
}

// ---- CROPS THIS PASS USES ------------------------------------------------------------------------------------
// Named once so two harnesses cannot disagree about where "the ground" is. The HUD band is excluded from `frame`:
// the hotbar is a bright constant and it moves any whole-frame mean by several levels.
export const CROP = {
  frame:  [0.02, 0.98, 0.02, 0.80],
  ground: [0.20, 0.80, 0.62, 0.80],
  upper:  [0.20, 0.80, 0.10, 0.40],
  centre: [0.38, 0.62, 0.38, 0.62],
  left:   [0.05, 0.35, 0.35, 0.70],
  right:  [0.65, 0.95, 0.35, 0.70],
};

export const fmt = o => o ? `lum ${o.lum} med ${o.med} p10 ${o.p10} min ${o.min} minCh ${o.minCh} sat ${o.sat} black ${o.blackPct}% near ${o.nearBlackPct}%` : 'n/a';

// ---- RESULT PRINTING -------------------------------------------------------------------------------------------
// Report the numbers, not the verdict (bench/README.md). check() still returns a boolean so a harness can exit
// non-zero, but it always prints the value it compared.
let _pass=0, _fail=0;
export function check(name, ok, detail){ if(ok) _pass++; else _fail++; console.log(`  ${ok?'ok  ':'FAIL'}  ${name}${detail!=null?'   '+detail:''}`); return ok; }
export function report(){ console.log(`\n  ${_pass}/${_pass+_fail}`); return _fail===0; }
