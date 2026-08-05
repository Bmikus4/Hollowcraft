// THE DASHED LINES BESIDE EVERY OPENING. At 5x they alternate pixel by pixel, which is a z-fight between two coplanar
// surfaces — not a T-junction crack, which would be solid. They sit OUTBOARD of the opening, at the wall segments' end-cap
// positions, and the shipped remedy is a 1% inset on those caps (BR_WT/2 * 0.99, about 1.8mm). The hypothesis this sweeps:
// 1.8mm at hall viewing distance is below the depth buffer's resolving power, so the pair still fights. If so, a larger
// inset kills the lines outright. The cap is the doorway reveal, so pulling it a centimetre or two in from the wall face
// only makes the reveal imperceptibly shallower — there is a lot of room to spend here.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// A DASHEDNESS metric, which is what actually distinguishes this artefact. Per column, take the luminance difference from its
// neighbour; a z-fighting line alternates sign every pixel along its length, so measure, for the worst column, how often the
// sign of the vertical row-to-row difference flips. High flip rate = dashed = z-fight. Also report the plain worst jump.
async function probe(page, box, k){
  const png=(await page.screenshot({type:'png'})).toString('base64');
  return await page.evaluate(async ({png,box,k})=>{
    const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
    const sx=Math.round(box[0]*img.width), sy=Math.round(box[1]*img.height);
    const sw=Math.max(1,Math.round((box[2]-box[0])*img.width)), sh=Math.max(1,Math.round((box[3]-box[1])*img.height));
    const cv=document.createElement('canvas'); cv.width=sw; cv.height=sh;
    const g=cv.getContext('2d'); g.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const d=g.getImageData(0,0,sw,sh).data;
    const L=(x,y)=>{ const i=(y*sw+x)*4; return (d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722)/255; };
    const cols=[]; for(let x=0;x<sw;x++){ let s=0; for(let y=0;y<sh;y++)s+=L(x,y); cols.push(s/sh); }
    // the worst column-to-column step, ignoring the opening's own hard silhouette (columns whose step exceeds 0.1)
    let worst=0, at=0; for(let x=1;x<sw;x++){ const j=Math.abs(cols[x]-cols[x-1]); if(j<0.1 && j>worst){worst=j;at=x;} }
    // how dashed is that column: along its height, does the local difference keep changing sign?
    let flips=0, prev=0, n=0;
    for(let y=1;y<sh;y++){ const dv=L(at,y)-L(at-1,y); if(Math.abs(dv)<1e-4) continue; const s=dv>0?1:-1; if(prev&&s!==prev)flips++; prev=s; n++; }
    const diffs=cols.slice(1).map((v,i)=>Math.abs(v-cols[i])).filter(v=>v<0.1).sort((a,b)=>a-b);
    return { worst:+worst.toFixed(4), at, median:+(diffs[Math.floor(diffs.length/2)]||1e-4).toFixed(5),
             dashRate:n? +(flips/n).toFixed(3) : 0, sampled:n, w:sw, h:sh };
  }, {png,box,k});
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);
    await page.evaluate(`__hc.aim(false)`);
    const op=await page.evaluate(`window.__hcBR.faceOpening('empty',3.4)`);
    if(!op){ console.log('no empty opening found'); process.exit(1); }
    await sleep(900);
    for(const ci of [1.0, 0.99, 0.96, 0.92, 0.86, 0.75]){
      await page.evaluate(`window.__hcBR.dbgGeom({capInset:${ci}})`); await sleep(1100);
      const r=await probe(page,[0.30,0.16,0.70,0.46],5);
      console.log('capInset '+ci.toFixed(2)+'  (inset '+(0.36/2*(1-ci)*1000).toFixed(1)+'mm)  worst '+r.worst
        +'  median '+r.median+'  ratio '+(r.worst/r.median).toFixed(1)+'  dashRate '+r.dashRate+' over '+r.sampled+' rows');
      if(ci===0.99 || ci===0.86) await page.screenshot({path:path.join(OUT,'capinset-'+String(ci).replace('.','_')+'.png')});
    }
    await page.evaluate(`window.__hcBR.dbgGeom({capInset:0.99})`);
    await browser.close();
  } finally { server.kill(); }
})();
