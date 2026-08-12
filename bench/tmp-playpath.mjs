// THE REAL PLAY PATH (Ben 08-11: "it never loads, it gets stuck without fading on the main menu image").
// Every bench in this repo boots ?debug=1, which sets started itself and never goes near startGame — so the
// path an actual player takes has no coverage at all. This clicks the menu button and watches.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const p of c) if(fs.existsSync(p)) return p; return undefined; }
const waitHttp=(u)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(u,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>200){ clearInterval(t); rej(new Error('no server')); } }); },500); });
(async()=>{
  const PORT=+(process.env.HC_PORT||8123), base='http://127.0.0.1:'+PORT;
  await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const page=await (await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1})).newPage();
  page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,300)));
  page.on('console',m=>{ const t=m.text(); if(/error|fail|ERROR: \d|GL_INVALID/i.test(t)) console.log('  CONSOLE:',t.slice(0,300)); });
  await page.goto(base+'/index.html',{waitUntil:'load',timeout:120000});   // NO ?debug — the player's path
  await sleep(4000);
  const menu=await page.evaluate(`(()=>{ const ids=['mb-solo','mb-continue','mb-creative-btn','mb-host','mb-join'];
    const out={}; for(const id of ids){ const e=document.getElementById(id); out[id]=e?{vis:getComputedStyle(e).display, txt:(e.textContent||'').trim().slice(0,28)}:'MISSING'; }
    out.boot=(document.getElementById('boot')||{style:{}}).style.display; return out; })()`);
  console.log('  menu buttons:', JSON.stringify(menu));
  await page.screenshot({path:path.join(ROOT,'bench/results/play-0-menu.png')});
  console.log('  clicking "Enter the Wood" (mb-solo)...');
  await page.evaluate(`document.getElementById('mb-solo').click()`);
  const t0=Date.now();
  let last='';
  for(let i=0;i<90;i++){
    await sleep(2000);
    const s=await page.evaluate(`(()=>{ try{
      const ls=(window.__hc&&__hc.loadState)?__hc.loadState():{no__hc:true};
      const el=id=>{const e=document.getElementById(id); if(!e) return 'MISSING';
        const cs=getComputedStyle(e); return cs.display+'/op'+(+cs.opacity).toFixed(2)+(e.className?('/'+e.className):''); };
      return { t:Math.round(performance.now()/100)/10, ls, load:el('load'), loadblack:el('loadblack'), bgvid:el('bgvid'), menufx:el('menufx'), boot:el('boot') };
    }catch(e){ return {err:String(e.message||e)}; } })()`);
    const line=JSON.stringify(s);
    if(line!==last){ console.log(`  +${((Date.now()-t0)/1000).toFixed(0)}s ${line}`); last=line; }
    if(s.ls && s.ls.circleDone && s.load && s.load.startsWith('none')) { console.log('  LOADED OK'); break; }
    if(i===14 || i===44) await page.screenshot({path:path.join(ROOT,`bench/results/play-${i}.png`)});
  }
  await page.screenshot({path:path.join(ROOT,'bench/results/play-final.png')});
  console.log('  frames: bench/results/play-*.png');
  await browser.close();
})();
