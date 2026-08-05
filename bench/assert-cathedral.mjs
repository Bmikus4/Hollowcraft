// ASSERT: the Mount Athos cathedral on the far-east highland still builds and is DRAWN. Ben: "I think cathedrals stopped
// loading."
//
// Three places it can die, and the diagnostics separate them: _cathedralFindSpot returns nothing (no dry, high, flattish
// spot on the east arc), the builder bails because that spot is at or under the sea, or the builder never gets its turn
// because _sReady never goes true for the site. Asking cathedralDiag before and after streaming the area tells them apart.
// forceCathedral is run LAST, not first -- it bypasses the 1-per-frame rotation, so running it early would hide exactly
// the failure being looked for.
//
// usage: node bench/assert-cathedral.mjs   -> bench/results/cathedral-*.png
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(label, cond, got){ checks++; if(!cond)fails++; console.log('  '+(cond?'ok  ':'FAIL')+'  '+label.padEnd(48)+' got='+JSON.stringify(got)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:', String(e.message||e).slice(0,300)); });
    await page.goto(base+'/index.html?debug=1&rd=8', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.setTime(0.42)');

    const d0 = await page.evaluate('__hc.cathedralDiag()');
    console.log('  diag at spawn: '+JSON.stringify(d0));
    ok('a site was found on the east arc', d0 && d0.spot && d0.spot.x!=null, d0&&d0.spot);
    ok('the site is dry land, above sea+2', d0 && d0.gy>d0.sea+2, d0&&[d0.gy,d0.sea]);

    // Fly there and let the area stream, which is what makes the builder eligible at all.
    console.log('  goCathedral: '+JSON.stringify(await page.evaluate('__hc.goCathedral(0,26,0)')));
    for(let i=0;i<10;i++){ await sleep(2500);
      const d=await page.evaluate('__hc.cathedralDiag()');
      console.log('   t+'+((i+1)*2.5).toFixed(1)+'s  ready='+d.ready+' done='+d.done+' ppos='+JSON.stringify(d.ppos));
      if(d.done) break; }
    const d1 = await page.evaluate('__hc.cathedralDiag()');
    ok('chunks around the site became ready', d1 && d1.ready===true, d1&&d1.ready);
    ok('the cathedral built once its area streamed', d1 && d1.done===true, d1&&d1.done);
    await page.screenshot({ path: path.join(OUT,'cathedral-streamed.png') });

    // Is it DRAWN? Look at the site from above and count stone-grey pixels; a cruciform church of that size fills a lot
    // of a downward view, and blocks that exist but never mesh is the failure mode this engine actually has.
    const stone = async (tag) => { const p=path.join(OUT,'cathedral-'+tag+'.png'); await page.screenshot({path:p});
      const {decodePNG}=await import('./pngprobe.mjs'); const img=decodePNG(fs.readFileSync(p));
      let n=0,t=0; for(let y=Math.floor(img.h*0.25);y<Math.floor(img.h*0.9);y++) for(let x=Math.floor(img.w*0.2);x<Math.floor(img.w*0.8);x++){
        const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; t++;
        if(r>70 && Math.abs(r-g)<26 && Math.abs(g-b)<30 && b>55) n++; }   // near-neutral grey, not foliage green or dirt brown
      return {n,t,pct:+(100*n/t).toFixed(1)}; };
    // FRAME IT BEFORE COUNTING. This check read 2.2% and looked like an unbuilt cathedral; it was a stale camera. The streaming
    // flight above uses goCathedral(0,26,0), which hovers 26 blocks directly OVER the site at pitch -0.12 -- very nearly level --
    // and that framed the building only while its base sat as high as min(_top+1, gy0+16). Ben had it lowered onto a 4-block
    // plinth at gy0+1, so from up there the church is entirely below the view and the frame is treetops. The building moved on
    // purpose; the aim had not. So stand back and aim AT it, by projection feedback, which cannot go stale with its height again.
    const site = await page.evaluate('__hc.cathedralDiag()');
    await page.evaluate('__hc.goCathedral(-96,44,0)'); await sleep(2600);
    const framed = await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const tx=${site.spot.x}+0.5, ty=${site.gy}+9, tz=${site.spot.z}+0.5;   // 9 up: the nave roof, not the plinth and not the dome
      let best=null;
      for(let i=0;i<48;i++){ const yaw=i/48*Math.PI*2;
        for(const pit of [-0.20,-0.10,0.0,0.08]){ __hcBR.look(yaw,pit); await f(); await f();
          const s=__hc.screenOf(tx,ty,tz);
          if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),pit,off:+off.toFixed(0)}; } } }
      if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); }
      return best; })()`);
    console.log('  framed the cathedral from 96 blocks out and 44 up: '+JSON.stringify(framed));
    ok('the cathedral could be framed at all', !!framed, framed);
    await sleep(1400);
    const S = await stone('above');
    console.log('  neutral-grey pixels looking at the site: '+JSON.stringify(S));
    ok('cathedral masonry is on screen', S.pct>6, S.pct);

    // Only now force it, so a pass above cannot have come from the bypass.
    if(!d1.done){ console.log('  forceCathedral: '+JSON.stringify(await page.evaluate('__hc.forceCathedral()')));
      await sleep(2500); const d2=await page.evaluate('__hc.cathedralDiag()');
      console.log('  after force: '+JSON.stringify(d2));
      await page.screenshot({ path: path.join(OUT,'cathedral-forced.png') }); }

    // THE CHURCH, the untested half of Ben's "cathedrals stopped loading" report. Same shape of question as the cathedral:
    // does it have a site, and does it build once the player is near it. __hc.church() already reports both.
    console.log('\n[4] the beach chapel');
    const ch0 = await page.evaluate('__hc.church()');
    console.log('  before: '+JSON.stringify(ch0));
    if(ch0 && ch0.x!=null){
      await page.evaluate('__hc.tp('+ch0.x+','+(ch0.z+14)+')');
      for(let i=0;i<10;i++){ await sleep(2500); const c=await page.evaluate('__hc.church()');
        console.log('   t+'+((i+1)*2.5).toFixed(1)+'s  done='+c.done); if(c.done) break; }
      const ch1 = await page.evaluate('__hc.church()');
      await page.evaluate('__hcBR.look(0,-0.05)'); await sleep(900);
      await page.screenshot({ path: path.join(OUT,'cathedral-church.png') });
      ok('the chapel built once its area streamed', ch1 && ch1.done===true, ch1&&ch1.done);
    } else {
      ok('the chapel has a site at all', false, ch0);
    }

    ok('no page errors', errs.length===0, errs.length);
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
