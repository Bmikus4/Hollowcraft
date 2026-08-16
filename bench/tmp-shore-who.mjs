// WHO IS DRAWING THE FLOATING TREELINE ON THE SEA HORIZON?
//
// Ben: "skybox pines do not look good, they extend well out into the sky", then "skybox pines look trash". From the
// west beach at eye height there IS a serrated treeline hanging above the water with sky between it and the waterline
// (bench/results/ph-w-dusk-on.png) - and it is STILL THERE with __hc.pines(0) (ph-w-dusk-off.png), while the coast
// mask carries forest on 0 of the 79 on-screen azimuths (tmp-pines-mask-probe). So the thing he is complaining about
// is probably not the thing named in the complaint. This asks each backdrop in turn, at the same stand, and writes a
// frame for each so the answer is a picture as well as a number.
//
//   node bench/tmp-shore-who.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.island()`); const SEA=IC.sea;
    const sh=await page.evaluate(`(()=>{ for(let d=Math.round(${IC.R}*1.6); d>40; d-=1){ const x=Math.round(${IC.cx}-d), z=Math.round(${IC.cz});
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
    await page.evaluate(`__hc.tpAt(${sh.x}, ${sh.g}+1.62, ${sh.z}); __hc.cam({yaw:${Math.atan2(1,0)}, pitch:0}); __hc.pinScene();`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2500);
    console.log(`  stand ${sh.x},${sh.z} ground ${sh.g}, looking due west out to sea`);
    console.log(`  mtn ${JSON.stringify(await page.evaluate(`__hc.mtn()`))}`);
    const rowsOf=async(tag)=>{ const f=path.join(OUT,'who-'+tag+'.png'); await page.screenshot({path:f});
      const b64=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${b64}';
        await im.decode(); const c=document.createElement('canvas'); c.width=1280; c.height=720;
        const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,1280,720).data; const rows=[];
        for(let y=0;y<720;y++){ let s=0; for(let x=200;x<900;x++){ const i=(y*1280+x)*4; s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; } rows.push(s/700); }
        return rows; })()`); };
    for(const [tag,t] of [['noon',0.30],['dusk',0.80]]){
      await page.evaluate(`__hc.dayLock&&__hc.dayLock(${t})`); await sleep(1500);
      await page.evaluate(`__hc.pines(1); __hc.mtn(1)`); await sleep(600); const all=await rowsOf(tag+'-all');
      await page.evaluate(`__hc.pines(0)`);            await sleep(600); const noP=await rowsOf(tag+'-nopines');
      await page.evaluate(`__hc.mtn(0)`);              await sleep(600); const none=await rowsOf(tag+'-neither');
      await page.evaluate(`__hc.pines(1); __hc.mtn(1)`); await sleep(600); const all2=await rowsOf(tag+'-all2');
      const band=(a,b)=>{ let lo=1e9,hi=-1,sum=0; for(let y=0;y<720;y++){ const d=Math.abs(a[y]-b[y]); if(d>1.0){ if(y<lo)lo=y; hi=y; sum+=d; } }
        return {lo,hi,sum:+sum.toFixed(1)}; };
      const drift=band(all,all2);
      const pines=band(all,noP), mtns=band(noP,none);
      console.log(`  ${tag}  drift rows ${drift.lo}..${drift.hi} sum ${drift.sum}`);
      console.log(`  ${tag}  PINES own rows ${pines.lo}..${pines.hi} (sum ${pines.sum})`);
      console.log(`  ${tag}  MTN   own rows ${mtns.lo}..${mtns.hi} (sum ${mtns.sum})`);
      // where the water horizon is, from the frame with NEITHER backdrop: the steepest fall in the row profile
      let hz=0,best=0; for(let y=1;y<720;y++){ const d=Math.abs(none[y]-none[y-1]); if(d>best){best=d;hz=y;} }
      console.log(`  ${tag}  water horizon row ${hz} (step ${best.toFixed(2)})  -> anything above it is sky, anything below is sea`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
