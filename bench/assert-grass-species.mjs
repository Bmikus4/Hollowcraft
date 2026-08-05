// OPEN COUNTRY GROWS MEADOW GRASS, WOODS GROW TALLGRASS (Ben 08-05: "grass thats pawns in plains, and closer to the shores
// should not be tallgrass, it should be meadowgrass and occasional tall meadowgrass").
// Surveys generated columns around several seeded spots and buckets every blade by plains mask / shore band / inland woods.
//   node bench/assert-grass-species.mjs
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
const add=(a,b)=>{ for(const k of Object.keys(b)) a[k]=(a[k]||0)+b[k]; return a; };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:560}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,280); await sleep(800);
    await page.evaluate(`__hc.rd(10)`);
    // Spawn itself (coast + woods) plus three real plains, found from the mask rather than guessed at a distance.
    const found=await page.evaluate(`__hc.plainsSpot(3,3200)`);
    console.log('    plains found', JSON.stringify(found));
    const spots=[null, ...found.map(p=>[p[0],p[1]])];
    const tot={plains:{},shore:{},woods:{}}; let cols=0;
    for(const s of spots){
      const m=await page.evaluate(`(async()=>{ const p=__hc.probe();
        const x=${s?s[0]:'p.x'}, z=${s?s[1]:'p.z'};
        __hc.tpAt(x, 200, z);
        // Chunk records exist before they are filled, so the wait is on GROUND under the feet, not on a timer.
        for(let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,250)); if(__hc.grassMix(24).cols>2000) break; }
        const g=__hc.probe().gyHere; __hc.tpAt(x, g+2, z);
        for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,250)); if(__hc.grassMix(110).cols>40000) break; }
        return __hc.grassMix(110); })()`);
      console.log('   ', `spot ${s?s.join(','):'spawn'}`.padEnd(18), JSON.stringify(m));
      if(m.err){ ok('survey at '+(s||'spawn'), false, m); continue; }
      cols+=m.cols; add(tot.plains,m.plains); add(tot.shore,m.shore); add(tot.woods,m.woods);
    }
    console.log('\n   totals', JSON.stringify(tot), 'cols', cols);
    const sum=o=>(o.tall||0)+(o.meadow||0)+(o.meadowTall||0);
    ok('the survey actually found generated ground', cols>60000, {cols});
    for(const band of ['plains','shore']){
      const t=tot[band], n=sum(t);
      if(n<40){ ok(band+': enough blades sampled to judge', false, {n, note:'no '+band+' in the sampled spots'}); continue; }
      ok(band+': no woodland tallgrass', (t.tall||0)===0, t);
      ok(band+': the tall variant is occasional, not the rule', (t.meadowTall||0)/n > 0.08 && (t.meadowTall||0)/n < 0.32, {frac:+((t.meadowTall||0)/n).toFixed(3), n});
    }
    // Inland woods keep tallgrass as their ground cover. They also carry BOTH meadow variants from the understory roll (Ben
    // 07-20) — that band is older than this change and is not what "should not be tallgrass" was about, so the test is that
    // tallgrass is still the woodland cover here, not that it is the only thing growing.
    { const t=tot.woods, n=sum(t);
      ok('woods: still tallgrass inland', n>200 && (t.tall||0) > (t.meadow||0), {...t, n}); }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
