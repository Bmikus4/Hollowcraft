// ASSERT: the menus, the cards, the hotbar, the vitals bars and the compass are drawn from Ben's asset pack
// (assets/ui, cut by tools/ui-slice.py) and not from hand-written CSS gradients.
//
// Ben 08-11: "they likely weren't redesigned using the assets that I gave you... Right now the menus look like standard
// buttons, I wanted them custom textured, with cool patternology and glyphs."
//
// THREE THINGS ARE MEASURED, and only the third needs explaining.
//   1. Every assets/ui file the page names actually serves 200. A UI built out of image files fails SILENTLY when one
//      is missing — the element keeps its box and loses its art — so a 404 sweep is the cheapest guard there is, and
//      the same class of miss (a path shipped without its file) has already cost this project a whole boot.
//   2. The computed styles carry an assets/ui URL where a gradient used to be. That is what "redesigned using the
//      assets" means in a form a machine can check.
//   3. THE COMPASS BAND IS TORN, NOT A RECTANGLE. The ribbon is a canvas, so there is no style to read: instead the
//      alpha along its top edge is sampled. A CSS gradient band has the same alpha all the way across (sd = 0); Ben's
//      underlay has eroded edges, so the alpha varies. That single number separates the two renders.
//
// usage: node bench/assert-ui-art.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT, 'bench', 'results');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(46)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});

  console.log('\n[the cut is repeatable and complete]');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT,'assets','ui','manifest.json'),'utf8'));
  const names = Object.keys(man).filter(k=>!k.startsWith('_'));
  const missing = names.filter(n=>!fs.existsSync(path.join(ROOT,'assets','ui',n+'.png')));
  ok('every manifest slice is on disk', missing.length===0, missing.slice(0,6));
  ok('the pack was actually cut up',    names.length>=120, names.length);
  ok('the palette came off the sheet',  Array.isArray(man._palette) && man._palette.length===7, man._palette);

  // Every path the page names, checked against the tree before a browser is even started: this is the one that would
  // otherwise only show up as a flat black button on the deployed build.
  const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const refs = [...new Set([...html.matchAll(/assets\/ui\/([A-Za-z0-9_\-]+)\.png/g)].map(m=>m[1]))];
  const dead = refs.filter(n=>!fs.existsSync(path.join(ROOT,'assets','ui',n+'.png')));
  ok('every asset the page names exists', dead.length===0, dead);
  ok('the page names a real set of them', refs.length>=15, refs.length);

  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720}});
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+e));
    const bad404=[]; page.on('response',r=>{ if(r.status()>=400 && /assets\/ui\//.test(r.url())) bad404.push(r.status()+' '+r.url()); });
    await page.goto(base+'/index.html',{waitUntil:'load'});
    await sleep(3000);

    console.log('\n[the menu is the pack, not a gradient]');
    const menu = await page.evaluate(()=>{
      const cs=s=>getComputedStyle(document.querySelector(s));
      const b=cs('#mb-solo');
      return { btnFrame:b.borderImageSource, btnBg:b.backgroundImage,
               flourish:getComputedStyle(document.querySelector('#menucard .flourish')).backgroundImage };
    });
    ok('menu button is 9-sliced art', /assets\/ui\/.*\.png/.test(menu.btnFrame), menu.btnFrame.slice(0,90));
    ok('its plate is a grunge tile',  /assets\/ui\/tex_/.test(menu.btnBg), menu.btnBg.slice(0,90));
    ok('the flourish is decoration 59', /assets\/ui\/deco_star/.test(menu.flourish), menu.flourish.slice(0,80));

    await page.click('#mb-settings'); await sleep(500);
    const card = await page.evaluate(()=>{ const c=getComputedStyle(document.getElementById('set-panel'));
      return { frame:c.borderImageSource, bg:c.backgroundImage, w:parseFloat(c.borderTopWidth) }; });
    ok('the card wears frame 01',     /assets\/ui\/frame_main/.test(card.frame), card.frame.slice(0,80));
    ok('with a real plate under it',  /assets\/ui\/tex_/.test(card.bg), card.bg.slice(0,80));
    ok('the frame has room to draw',  card.w>=20, card.w);
    await page.evaluate(()=>document.querySelector('#set-panel [data-back]').click()); await sleep(300);

    await page.click('#mb-solo');
    for(let i=0;i<90;i++){ if(await page.evaluate(()=>window.__hc&&window.__hc.loadState().circleDone)) break; await sleep(500); }
    await sleep(2500);

    console.log('\n[the HUD is the pack too]');
    const hud = await page.evaluate(()=>{
      const out={};
      for(const k of ['health','food','water','stam','armor']){
        const row=document.querySelector('.v-'+k);
        out[k]={ glyph:getComputedStyle(row.querySelector('.vlab')).backgroundImage,
                 bed:getComputedStyle(row.querySelector('.vtrack')).backgroundImage,
                 mask:getComputedStyle(row.querySelector('.vfill')).maskImage
                      || getComputedStyle(row.querySelector('.vfill')).webkitMaskImage }; }
      out.hotbar=getComputedStyle(document.getElementById('hotbar')).borderImageSource;
      // not '#hotbar .slot' — the first of those is the OFFHAND, which wears the dashed frame on purpose.
      out.slot=getComputedStyle(document.querySelector('#hotbar > .slot')).borderImageSource;
      out.off=getComputedStyle(document.querySelector('#offslot .slot')).borderImageSource;
      return out; });
    for(const k of ['health','food','water','stam','armor']){
      ok(k+' bar: glyph, bed and mask are art',
        /assets\/ui\//.test(hud[k].glyph) && /assets\/ui\/bar_/.test(hud[k].bed) && /assets\/ui\/bar_/.test(hud[k].mask),
        {glyph:hud[k].glyph.slice(-24), bed:hud[k].bed.slice(-24), mask:String(hud[k].mask).slice(-24)}); }
    // Each bar must wear its OWN colour out of the pack, or the five rows are one image five times.
    const beds=new Set(['health','food','water','stam','armor'].map(k=>hud[k].bed.replace(/.*\/(bar_[a-z_]+)\.png.*/,'$1')));
    ok('the bars are not all one image', beds.size>=4, [...beds]);
    ok('hotbar plate is art',   /assets\/ui\//.test(hud.hotbar), hud.hotbar.slice(-30));
    ok('hotbar cells are art',  /assets\/ui\/hcell/.test(hud.slot), hud.slot.slice(-30));
    ok('the offhand keeps its dashed edge', /assets\/ui\/btn_dash/.test(hud.off), hud.off.slice(-30));

    console.log('\n[the compass band is torn, not a rectangle]');
    const band = await page.evaluate(()=>{
      const c=document.querySelector('#compass canvas'); const g=c.getContext('2d');
      const d=g.getImageData(0,0,c.width,3).data;
      const a=[]; for(let i=3;i<d.length;i+=4) a.push(d[i]);
      const m=a.reduce((s,v)=>s+v,0)/a.length;
      const sd=Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length);
      return { mean:+m.toFixed(1), sd:+sd.toFixed(1), w:c.width }; });
    ok('the top edge varies (eroded)', band.sd>6, band);
    ok('and it is actually drawn',     band.mean>4, band.mean);
    await page.screenshot({path:path.join(OUT,'ui-art.png')});

    ok('no assets/ui request failed', bad404.length===0, bad404.slice(0,5));
    ok('no page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\n'+(fails?'FAILED ':'PASSED ')+(checks-fails)+'/'+checks);
  process.exit(fails?1:0);
})();
