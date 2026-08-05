// HOW BIG IS A GUN IN THE OFFHAND? Ben, after the "all guns one size" change shipped: "items in the offhand are wayy too
// tiny, like literally tiny little items or they dont appear".
//
// Fitting a gun's LENGTH to 0.115 -- the apparent size of a block in the main hand -- is what did it: a metre-long rifle
// squeezed into fist width leaves a barrel a few pixels across. So this photographs the same rifle at three candidate
// lengths and lets Ben pick, and it also checks the "they dont appear" half by putting a NON-gun in the same hand.
//
// usage: node bench/tmp-offfit.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(5000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.30)'); await sleep(1000);

    // Count the pixels the offhand item covers: the lower-left quadrant is where that fist is drawn, and the item is the
    // only thing in it that changes when the item changes. Shot with the item and with the hand emptied, then differenced.
    const cover = async (tag)=>{
      const fa=path.join(OUT,'offfit-'+tag+'.png'); await page.screenshot({path:fa});
      const held=await page.evaluate('__hc.offhandUse()');
      await page.evaluate('__hc.offhandSet(null)'); await sleep(600);
      const fb=path.join(OUT,'offfit-'+tag+'-empty.png'); await page.screenshot({path:fb});
      const A=decodePNG(fs.readFileSync(fa)), B=decodePNG(fs.readFileSync(fb));
      let n=0; const x1=Math.floor(A.w*0.42), y0=Math.floor(A.h*0.35);
      for(let y=y0;y<A.h;y++) for(let x=0;x<x1;x++){ const i=(y*A.w+x)*A.ch;
        const d=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
        if(d>18) n++; }
      return { px:n, extent:held.offExtent, scale:held.offScale };
    };

    const cls=await page.evaluate('__hc.itemClasses()');
    const gun=cls.gun||'ar15';

    console.log('  A GUN ('+gun+') in the offhand, at three lengths:');
    for(const fit of [0.115, 0.34, 0.50]){
      await page.evaluate('__hc.offhandSet('+JSON.stringify(gun)+')'); await sleep(400);
      const f=await page.evaluate('__hc.offFit('+fit+')'); await sleep(900);
      const c=await cover('gun-'+String(fit).replace('.','p'));
      console.log('     fit '+String(fit).padEnd(6)+' → drawn extent '+String(c.extent).padEnd(7)+' scale '+String(c.scale).padEnd(9)+' covers '+c.px+' px'
        + (fit===0.115?'   <- what shipped, and what he called tiny':''));
    }

    // "or they dont appear": a torch, a block and a shield through the same hand, at the size they have always had.
    console.log('  NON-GUN items in the same hand (their sizing is unchanged):');
    for(const id of ['torch','planks','shield','wooden_spear']){
      await page.evaluate('__hc.offhandSet('+JSON.stringify(id)+')'); await sleep(800);
      const c=await cover('item-'+id);
      console.log('     '+id.padEnd(14)+' drawn extent '+String(c.extent).padEnd(7)+' covers '+String(c.px).padEnd(6)+' px'+(c.px<200?'   <- BARELY VISIBLE':''));
    }
    console.log('  frames: bench/results/offfit-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
