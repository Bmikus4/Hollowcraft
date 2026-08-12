// THE CANOPY IN A NIGHT FOG BANK, WITH THE NUMBERS THE GAME ITSELF REPORTS.
//
// Ben 08-12: "leaves arent rendering at night", "its because of the fog". __hc.fadeTargets() already exists for exactly
// this question — it returns the luminance a leaf fades TO once the night term is applied on top of three's own fog,
// beside the fog's own colour — so the mechanism can be read off the running build instead of guessed from a still.
// Crops: the canopy filling the lower middle of the frame, and a patch of open sky, from the SAME png.
//
// The fog is set and then given six seconds: the shell that paints the bank over the sky ramps its opacity toward the
// target, so a frame taken immediately after __hc.fog() is a frame of a bank that is still arriving. Two runs of this
// harness disagreed by 6.8 luminance for that reason alone.
//
//   node bench/tmp-leaf-fog2.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null; const rows=[];
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,q] of [['sweep','']]){
      const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
      await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
      await page.goto(base+'/'+PAGE+'?debug=1&rd=10'+q,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
      const IC=await page.evaluate(`__hc.isleStats()`);
      const fx=IC.x-Math.round(IC.R*0.35), fz=IC.z+Math.round(IC.R*0.20);
      const g=await page.evaluate(`__hc.groundY(${fx},${fz})`);
      await page.evaluate(`__hc.tpAt(${fx}+0.5, ${g}+46, ${fz}+0.5); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:-0.34})`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      // THE SWEEP IS INTERLEAVED IN ONE PAGE, and 0 is repeated last as the noise floor: __hc.folAmb is a live uniform,
      // so the whole bracket can be shot without a reload and nothing else in the frame moves between rows.
      for(const [when,t,fog,amb] of [['amb0',0.75,0,0],['amb05',0.75,0,0.5],['amb10',0.75,0,1.0],['amb20',0.75,0,2.0],['amb10-fog',0.75,0.6,1.0],['amb0-repeat',0.75,0,0]]){
        await page.evaluate(`__hc.folAmb(${amb}); __hc.fog(${fog}); __hc.freezeT(0); __hc.setTime(${t})`);
        await sleep(6000);
        await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
        const ft=await page.evaluate(`__hc.fadeTargets()`), fi=await page.evaluate(`__hc.fogInfo()`);
        const f=path.join(OUT,`leaffog-${tag}-${when}.png`); await page.screenshot({path:f});
        const buf=fs.readFileSync(f).toString('base64');
        const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
          await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
          const g2=c.getContext('2d'); g2.drawImage(im,0,0);
          const med=(x,y,w,h)=>{ const d=g2.getImageData(x,y,w,h).data,a=[];
            for(let i=0;i<d.length;i+=4) a.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]);
            a.sort((p,q)=>p-q); return +a[a.length>>1].toFixed(1); };
          return { canopy:med(420,340,360,300), sky:med(900,60,300,120) }; })()`);
        rows.push([`${tag} ${when} amb${amb}`,`canopy ${s.canopy}`,`sky ${s.sky}`,`folEff ${ft.folEffLum}`,`fogLum ${ft.fogLum}`,`mix ${ft.mix}`,`wx ${fi.wx}`]);
        console.log(`    ${tag} ${when}  canopy ${s.canopy}  sky ${s.sky}  folEffLum ${ft.folEffLum}  fogLum ${ft.fogLum}  mix ${ft.mix}  wx ${fi.wx}`);
      }
      await ctx.close();
    }
    console.log('\n  '+rows.map(r=>r.join('  |  ')).join('\n  '));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
