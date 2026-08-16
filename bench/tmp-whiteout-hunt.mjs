// HUNT FOR THE WHITEOUT. Ben 08-12: "randomly trees, foliage, and the sky are all turning white and dissapearing ...
// its not always all three, and its not always immediate. maybe tied to resource management".
//
// Nothing in the reports pins it to a place or an hour, so this flies a long circuit that forces chunk streaming and
// crosses dawn and dusk, samples the frame every few seconds, and only writes a png when a sample DEPARTS from the run
// of samples before it. What it saves with the png is the state that would explain it: renderer memory and program
// counts, the shared uniforms every one of those three materials reads, and any console line the page emitted since
// the last tick. A whiteout with no console line and a flat program count is a different bug from one that arrives on
// the frame a program is compiled.
//
//   node bench/tmp-whiteout-hunt.mjs [page] [minutes]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const MINUTES=+(process.argv[3]||6);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    let logs=[];
    page.on('console',m=>{ const t=m.text(); if(/error|Error|WARN|warn|invalid|fail|lost/i.test(t)) logs.push(t.slice(0,300)); });
    page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,300)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`);
    // The circuit: a ring at treetop height around the island, so every tick lands on ground that has to stream in, and
    // the sky, the canopy and the sea are all in frame at once.
    const N=Math.round(MINUTES*60/3);
    let prev=null, hits=0;
    const diag=[];
    for(let i=0;i<N;i++){
      const th=i/N*Math.PI*8;                                        // four laps
      const r=IC.R*(0.55+0.35*Math.sin(i/7));
      const x=Math.round(IC.x+Math.cos(th)*r), z=Math.round(IC.z+Math.sin(th)*r);
      const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      // THE CLOCK SWEEPS. The first run of this harness sat at day 0.00 for all 120 ticks — __hc.cinema pins the sky —
      // so six minutes of circuit never saw daylight, dawn or dusk, which is most of the world a whiteout could live in.
      // Weather is stepped with it, because a fog bank is the other state the three affected materials share.
      const _t=((i*7)%100)/100, _fg=(i%17===0)?0.6:(i%23===0?0.25:0);
      await page.evaluate(`__hc.freezeT(0); __hc.setTime(${_t}); __hc.fog(${_fg});`);
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${Math.max(g,42)+34}, ${z}+0.5); __hc.cam({yaw:${(th+Math.PI).toFixed(3)}, pitch:-0.12})`);
      await sleep(2600);
      const f=path.join(OUT,'wh-tick.png'); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g2=c.getContext('2d'); g2.drawImage(im,0,0);
        const d=g2.getImageData(0,0,im.width,im.height).data; let sum=0,white=0,n=0;
        for(let i=0;i<d.length;i+=16){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; sum+=L; n++; if(L>238) white++; }
        const r=window.__hcR||(window.__hcR=null);
        return { mean:+(sum/n).toFixed(1), white:+(100*white/n).toFixed(1) }; })()`);
      const st=await page.evaluate(`(()=>{ try{ const o={};
        const inf=(window.__hcInfo&&__hcInfo())||null; o.day=+__hc.st().day;
        o.fog=__hc.fogInfo(); o.fade=__hc.fadeTargets(); o.o3=__hc.ocean3&&__hc.ocean3(); o.gpu=__hc.gpuInfo&&__hc.gpuInfo();
        return o; }catch(e){ return {err:String(e.message||e)}; } })()`);
      const flag = prev && (Math.abs(s.mean-prev.mean)>28 || s.white-prev.white>8);
      const line=`t${i} mean ${s.mean} white% ${s.white} day ${st.day!=null?(+st.day).toFixed(2):'?'} fogLum ${st.fog&&st.fog.colorLum!=null?(+st.fog.colorLum).toFixed(4):'?'}${flag?'  <== JUMP':''}${st.gpu?'  prog '+st.gpu.prog+' tex '+st.gpu.tex+' geo '+st.gpu.geo+' heap '+st.gpu.heapMB:''}${logs.length?'  logs:'+logs.length:''}`;
      diag.push(line); console.log('   '+line);
      if(flag){ hits++; const keep=path.join(OUT,`wh-jump-${i}.png`); fs.copyFileSync(f,keep);
        console.log('     saved '+path.basename(keep)+'  state '+JSON.stringify(st).slice(0,600));
        if(logs.length) console.log('     logs: '+logs.join(' | ').slice(0,600)); }
      logs=[];
      prev=s;
    }
    console.log(`\n  ${N} ticks, ${hits} jumps`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
