// DOES AN OPEN LEAF SWEEP INTO ITS OWN JAMB — the last geometric risk left by varying the doorway width. A single leaf is
// the FULL clear width hung off one jamb, and that branch only became reachable when the fixed 2.2 opening was varied, so
// the question is not "does a leaf clip" in the abstract but "does the single-leaf branch clip worse than the double one
// that already shipped". Both numbers are printed; the pass rule is pre-registered on the comparison, not on my reading.
//
// The metric is ALONG-WALL DEPTH BEHIND THE HINGE (see __hcBR.doorClearance). An AABB cannot answer this: an open leaf's
// box overlaps the wall's box by construction. BR_JW = 0.06 of reveal lining is the only allowance before real masonry.
//
// Some penetration is EXPECTED and correct: the slab is 0.10 thick centred on the hinge axis, so 0.05 of it is behind the
// hinge at any angle — that is a hinge stile sitting against its jamb, and it is what a real door looks like. The figure
// worth reading is how far PAST the lining anything reaches.
//
// usage: node bench/br-door-clearance.mjs      (HC_ROOT=<pinned tree>)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const ARGS=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--disable-frame-rate-limit'];
const stat=(a)=>{ if(!a.length) return null; const s=[...a].sort((p,q)=>p-q);
  return { n:s.length, med:+s[s.length>>1].toFixed(4), max:+s[s.length-1].toFixed(4) }; };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:800,height:600}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    page.on('console',m=>{ if(m.type()==='error' && /exception caught/.test(m.text())) console.log('LOOP-THREW:',m.text().slice(0,160)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);

    const all=[];
    for(const seed of [99991,1234567,31337,4242,777]){
      await page.evaluate(`window.__hcBR.seed(${seed})`); await sleep(2200);
      for(const [dx,dz] of [[0,0],[240,0],[-240,-240]]){
        await page.evaluate(`window.__hcBR.tp(${dx},${dz})`); await sleep(2200);
        // STREAMING MUST HAVE MOVED between samples: a frame-loop exception leaves brxStream unreached and every teleport
        // re-measures one maze, which reads as an unchanging wall count.
        const st=await page.evaluate(`(()=>{const s=window.__hcBRX.stats();return {chunk:s.chunk,walls:s.walls};})()`);
        const C=await page.evaluate(`window.__hcBR.doorClearance(9)`);
        for(const c of C) all.push(c);
        console.log('seed '+String(seed).padEnd(8)+' chunk '+String(JSON.stringify(st.chunk)).padEnd(9)+
                    ' walls='+String(st.walls).padStart(4)+'  hung='+String(C.length).padStart(3)+
                    '  worstPen='+(C.length?Math.max(...C.map(c=>c.pen)).toFixed(3):'-'));
      }
    }
    if(!all.length){ console.log('RESULT: NO DATA — no door reported pivots'); await browser.close(); return; }

    const allow=all[0].allow;
    const S=all.filter(c=>!c.dbl), D=all.filter(c=>c.dbl);
    console.log('\n'+all.length+' hung leaves sampled   single '+S.length+'  double '+D.length+'   lining allowance '+allow);
    console.log('penetration behind the hinge (m):');
    console.log('  single: '+JSON.stringify(stat(S.map(c=>c.pen))));
    console.log('  double: '+JSON.stringify(stat(D.map(c=>c.pen))));
    for(const k of [0,1,2]){ const g=all.filter(c=>c.kind===k); if(g.length) console.log('  kind '+k+': '+JSON.stringify(stat(g.map(c=>c.pen)))); }
    const over=all.filter(c=>c.pen>allow+1e-4);
    console.log('past the lining: '+over.length+' of '+all.length+
                (over.length? '   worst '+JSON.stringify(over.sort((a,b)=>b.pen-a.pen)[0]) : ''));
    if(S.length) console.log('  worst single: '+JSON.stringify(S.sort((a,b)=>b.pen-a.pen)[0]));
    if(D.length) console.log('  worst double: '+JSON.stringify(D.sort((a,b)=>b.pen-a.pen)[0]));

    // PRE-REGISTERED RULE: the width change is clean if the single-leaf branch penetrates no deeper than the double-leaf
    // branch that already shipped. An absolute figure over the lining is a pre-existing property of the leaf furniture and
    // is reported, not treated as a regression of this change.
    const ms=S.length?Math.max(...S.map(c=>c.pen)):0, md=D.length?Math.max(...D.map(c=>c.pen)):0;
    console.log('\nRESULT: '+(S.length===0 ? 'INCONCLUSIVE — no single-leaf door in the sample'
      : ms<=md+1e-4 ? 'NO REGRESSION — single '+ms.toFixed(4)+' <= double '+md.toFixed(4)
      : 'SINGLE-LEAF WORSE — single '+ms.toFixed(4)+' vs double '+md.toFixed(4)));
    await browser.close();
  } finally { server.kill(); }
})();
