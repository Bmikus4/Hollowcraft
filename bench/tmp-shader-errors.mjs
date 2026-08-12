// What does the GPU say about the shaders RIGHT NOW? Boots the page and prints every shader compile /
// link error and page error verbatim. No crops, no statistics — a compile failure is not a measurement.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const p of c) if(fs.existsSync(p)) return p; return undefined; }
const waitHttp=(url)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(url,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>200){ clearInterval(t); rej(new Error('no server')); } }); },500); });
(async()=>{
  const PORT=+(process.env.HC_PORT||8123), PAGE=process.env.HC_PAGE||'index.html';
  const base='http://127.0.0.1:'+PORT; await waitHttp(base+'/'+PAGE);
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const page=await (await browser.newContext({viewport:{width:900,height:500},deviceScaleFactor:1})).newPage();
  const hits=[];
  page.on('pageerror',e=>hits.push('PAGEERROR: '+String(e.message||e)));
  page.on('console',m=>{ const t=m.text();
    if(/ERROR: \d|GL_INVALID|shader|Program|compil|link/i.test(t)) hits.push('CONSOLE: '+t); });
  await page.goto(base+'/'+PAGE+'?debug=1&rd=4',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  for(let i=0;i<120;i++){ if(await page.evaluate(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`)) break; await sleep(1000); }
  await sleep(4000);
  if(!hits.length) console.log('  no shader or page errors reported');
  for(const h of hits.slice(0,12)) console.log('  '+h.slice(0,2600).replace(/\n/g,'\n    '));
  console.log(`  ${hits.length} total`);
  await browser.close();
})();
