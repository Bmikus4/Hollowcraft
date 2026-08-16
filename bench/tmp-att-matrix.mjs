// THE ATTACHMENT MATRIX, printed. Ben's three questions, answered as tables rather than prose.
//   node bench/tmp-att-matrix.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    const M=await page.evaluate(`__hc.attMatrix()`);
    if(M.err){ console.log('ERR '+M.err); return; }
    const A=M.atts;
    console.log(`\n${M.guns} guns, ${A.length} attachments, slots: ${M.slots.join(' ')}\n`);
    console.log('gun                 modelled rail(auth) muzzle forend | '+A.map(a=>a.slice(0,6).padEnd(6)).join(' ')+' | n');
    console.log('-'.repeat(150));
    for(const r of M.rows){
      console.log(r.gun.padEnd(20)+
        String(r.modelled?'yes':'NO').padEnd(9)+
        String(r.rail?(r.authoredRail?'yes(auth)':'yes(sight)'):'NO').padEnd(11)+
        String(r.muzzle?'yes':'NO').padEnd(7)+String(r.forend.toFixed(2)+(r.authoredGrip?'*':' ')).padEnd(7)+'| '+
        A.map(a=>(r.fits[a]?'  Y   ':'  .   ')).join(' ')+' | '+r.n);
    }
    // The three summaries Ben asked for, as counts rather than an impression.
    const noRail=M.rows.filter(r=>!r.rail).map(r=>r.gun);
    const noMuz=M.rows.filter(r=>!r.muzzle).map(r=>r.gun);
    const notModelled=M.rows.filter(r=>!r.modelled).map(r=>r.gun);
    const allFive=M.rows.filter(r=>r.n===A.length).length;
    console.log(`\n  every attachment fits: ${allFive} of ${M.rows.length} guns`);
    console.log(`  no rail (no optic):    ${noRail.length}  ${noRail.join(' ')}`);
    console.log(`  no muzzle point:       ${noMuz.length}  ${noMuz.join(' ')}`);
    console.log(`  not modelled at all:   ${notModelled.length}  ${notModelled.join(' ')}`);
    // WITHIN REASON: the question is whether a revolver refuses a foregrip.
    const rev=M.rows.filter(r=>/revolver|snub|sawn|pistol|flare/.test(r.gun));
    console.log('\n  "within reason" spot check — should a pistol take an underbarrel foregrip?');
    for(const r of rev) console.log(`    ${r.gun.padEnd(18)} forend ${r.forend.toFixed(2)}  foregrip ${r.fits.foregrip?'ACCEPTED':'refused'} ${r.why.foregrip?'('+r.why.foregrip+')':''}   red_dot ${r.fits.red_dot?'accepted':'refused'}   suppressor ${r.fits.suppressor?'accepted':'refused'}`);
    const fe=M.rows.filter(r=>r.modelled).map(r=>({g:r.gun,f:r.forend})).sort((a,b)=>a.f-b.f);
    console.log('\n  forend length, sorted — the threshold must sit in a GAP, not through a crowd:');
    console.log('    '+fe.map(x=>x.g+' '+x.f.toFixed(2)).join('\n    '));
    fs.writeFileSync(path.join(ROOT,'bench','results','att-matrix.json'), JSON.stringify(M,null,1));
  }catch(e){ console.log('  ERROR: '+(e&&e.message||e)); }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})();
