// HOW BIG IS AN ITEM IN THE LEFT HAND, AGAINST THE SAME ITEM IN THE RIGHT ONE.
//
// Ben: "items are still really tiny in the offhand". The offhand normalises every non-gun item to a fixed longest
// side (_itemOffFit) while the main hand draws each class at its own hand-tuned scale, so the two hands are only
// comparable in APPARENT size — longest side divided by the group's depth from the eye (-0.62 main, -0.34 off).
// __hc.handSize() reports exactly that. ratio < 1 means the left hand is smaller than the right.
//
//   node bench/tmp-offsize.mjs [--itemfit 0.24]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const argv = process.argv.slice(2);
const arg = (k,d)=>{ const i=argv.indexOf('--'+k); return i>=0 ? argv[i+1] : d; };
const FITS = (arg('itemfit',null)||'').split(',').filter(Boolean).map(Number);
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});

    const classes = await page.evaluate(`__hc.itemClasses()`);
    const ids = [];
    for(const k of Object.keys(classes)){ if(k==='gunsAll') continue; if(classes[k]) ids.push([k, classes[k]]); }
    console.log('classes: '+ids.map(([k,v])=>k+'='+v).join(' '));

    const measure = async (id) => {
      // The main hand reads inv[selSlot]; put it in every hotbar slot so this does not depend on which one is selected.
      await page.evaluate(`(()=>{ for(let i=0;i<9;i++) __hc.qSet('inv',i,${JSON.stringify(id)},1); __hc.offhandSet(${JSON.stringify(id)},1); })()`);
      await sleep(320);                                    // both viewmodels are rebuilt inside updateView, i.e. next frame
      return await page.evaluate(`__hc.handSize()`);
    };

    const report = async (label) => {
      console.log('\n'+label);
      const rows=[];
      for(const [k,id] of ids){
        const r = await measure(id);
        if(r.err){ console.log(`  ${k.padEnd(12)} ${id.padEnd(16)} ERR ${r.err}`); continue; }
        const m=r.main, o=r.off;
        rows.push({k,id,main:m&&m.ang,off:o&&o.ang,ratio:r.ratio});
        console.log(`  ${k.padEnd(12)} ${id.padEnd(16)} main ang ${String(m?m.ang:'-').padStart(7)} (len ${String(m?m.len:'-').padStart(7)})   off ang ${String(o?o.ang:'-').padStart(7)} (len ${String(o?o.len:'-').padStart(7)})   ratio ${String(r.ratio).padStart(6)}`);
      }
      const rs=rows.map(r=>r.ratio).filter(x=>x>0).sort((a,b)=>a-b);
      if(rs.length) console.log(`  ratio median ${rs[(rs.length-1)>>1]}   min ${rs[0]}   max ${rs[rs.length-1]}   under 0.6: ${rows.filter(r=>r.ratio<0.6).map(r=>r.k).join(',')||'none'}`);
      return rows;
    };

    const fit0 = await page.evaluate(`__hc.handSize().itemFit`);
    await report(`itemFit ${fit0} (as shipped)`);
    for(const f of FITS){ await page.evaluate(`__hc.itemFit(${f})`); await report(`itemFit ${f}`); }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
