// HOW MUCH DOES A DOORWAY HEAD VARY — the "identical on ~50 doors" half of Ben's report that the halls read as a repeated
// asset. Counts distinct (arch, span, head height) combinations across every DOORWAY header in many generations.
//
// Uses `__hcBR.lintels()`, NOT `__hcBR.arches()`: arches ends in `.filter(a=>a.arch)`, so asking it about variety reports
// 100% arched by construction — it cannot see a flat header. That mistake produced a confident "every door is identical"
// off 23 records, and it was a statement about the probe.
//
// Crawl and tunnel heads are counted separately. They are different openings, and pooling them would inflate the variety
// of the thing Ben is actually looking at.
//
// usage: node bench/br-door-variety.mjs      (HC_ROOT=<pinned tree>)
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

    const rows=[]; const seen=new Set(); const fits=[];
    for(const seed of [99991,1234567,31337,4242,777]){
      await page.evaluate(`window.__hcBR.seed(${seed})`); await sleep(2200);
      for(const [dx,dz] of [[0,0],[240,0],[-240,-240]]){
        await page.evaluate(`window.__hcBR.tp(${dx},${dz})`); await sleep(2200);
        // STREAMING MUST HAVE MOVED. A frame-loop exception leaves brxStream unreached and every teleport re-measures one
        // maze; identical counts across three teleports is the tell, so the chunk is printed with each sample.
        const st=await page.evaluate(`(()=>{const s=window.__hcBRX.stats();return {chunk:s.chunk,walls:s.walls};})()`);
        const L=await page.evaluate(`window.__hcBR.lintels()`);
        const F=await page.evaluate(`window.__hcBR.doorFit()`);
        for(const f of F) fits.push(f);
        const doors=L.filter(l=>l.kind==='door');
        for(const d of doors){ const k=(d.arch?'arch':'flat')+' span'+d.span.toFixed(1)+' head'+d.y0.toFixed(2);
          rows.push(k); seen.add(k); }
        console.log('seed '+String(seed).padEnd(8)+' chunk '+String(JSON.stringify(st.chunk)).padEnd(9)+
                    ' walls='+String(st.walls).padStart(4)+
                    '  lintels='+String(L.length).padStart(3)+'  doors='+String(doors.length).padStart(3)+
                    '  crawl='+L.filter(l=>l.kind==='crawl').length+'  tunnel='+L.filter(l=>l.kind==='tunnel').length);
      }
    }
    // DOES THE LEAFWORK FILL THE OPENING. A varied width is only correct if the leaves still reach both jambs, and the
    // single-leaf branch is newly reachable (dbl flips at dw 1.953, and the old fixed width 2.2 was always double).
    const built=fits.filter(f=>f.leafW!==null);
    const gaps=built.filter(f=>Math.abs(f.gap)>0.001);
    const singles=built.filter(f=>!f.dbl), doubles=built.filter(f=>f.dbl);
    const wrongPivots=built.filter(f=>f.pivots!==f.leaves);
    console.log('\nhung doors '+fits.length+', of which built '+built.length+
                '   single-leaf '+singles.length+' ('+(100*singles.length/Math.max(1,built.length)).toFixed(1)+'%)'+
                '   double '+doubles.length);
    console.log('leaf span vs opening: '+gaps.length+' with a gap over 1mm'+(gaps.length?'  worst '+gaps.map(g=>g.gap).sort((a,b)=>Math.abs(b)-Math.abs(a))[0]:'')+
                '   pivot count wrong on '+wrongPivots.length);
    if(singles.length) console.log('  narrowest single: '+JSON.stringify(singles.sort((a,b)=>a.dw-b.dw)[0]));
    if(doubles.length) console.log('  widest double:    '+JSON.stringify(doubles.sort((a,b)=>b.dw-a.dw)[0]));
    if(gaps.length) console.log('  sample gap: '+JSON.stringify(gaps[0]));

    const tally=new Map(); for(const k of rows) tally.set(k,(tally.get(k)||0)+1);
    const sorted=[...tally.entries()].sort((p,q)=>q[1]-p[1]);
    console.log('\n'+rows.length+' doorway headers, '+sorted.length+' distinct (arch, span, head)');
    for(const [k,v] of sorted.slice(0,14)) console.log('  '+String(v).padStart(4)+'  '+(100*v/rows.length).toFixed(1).padStart(5)+'%  '+k);
    const top=sorted.length?100*sorted[0][1]/rows.length:0;
    console.log('\nmost common form covers '+top.toFixed(1)+'% of doorways');
    console.log('RESULT: '+(sorted.length>=4 && top<=60 ? 'VARIED' : 'REPEATED — '+sorted.length+' form(s), top '+top.toFixed(1)+'%'));
    await browser.close();
  } finally { server.kill(); }
})();
