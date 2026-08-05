// ASSERTION: no two backrooms walls occupy the same line, at the same height, over the same span.
//
// It was written to FAIL: the reproducible form of a bug 90% fixed in d2a425f, where the within-chunk overlaps went away and
// roughly twenty per region remained, all CROSS-CHUNK -- two chunks growing into each other over a shared boundary, which
// neither chunk's own line buffer can see. That is now fixed at the source (an end on a chunk's own perimeter never grows)
// and this passes at 0 across all 8 regions. It stays as the regression guard for it.
//
// The count is only trustworthy because the query is proved capable of firing first: a control clones one wall, shifted
// half its length along its own axis, which is by construction a collinear same-storey overlap. If that is not detected,
// the run aborts rather than reporting a number.
//
// Several regions are walked, because one region is not a rule -- and the previous version of the shrub check taught this
// codebase exactly that lesson by passing on a sample that did not contain the thing it tested.
//
// usage: node bench/assert-br-overlaps.mjs
//        exit 0 = pass (no overlaps), 1 = fail
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const FLAGS = (process.argv[2] && !process.argv[2].startsWith('--')) ? ('&'+process.argv[2]) : '';
const STARVED = process.argv.includes('--starve');   // skip the build wait, to prove the guard catches a starved region
// MINIMUM WALLS PER REGION, from measurement rather than feel. Two independent runs reported 616-676 walls per region
// across 8 regions, carrying 21-27 overlaps each, so 400 sat well below every real observation.
//
// RECALIBRATED when the rooms were made vaster (Ben: "rooms should be more vast"): the same grid cut into bigger pieces has
// fewer partitions in it, and the count fell to 370-434 per region on the same seeds — so the old 400 began ABORTING on a
// perfectly built region. 250 is the new floor. It still sits far above the failure this guard exists for: an unbuilt region
// reports near zero, not three hundred.
//
// The measurement also REVISED why this guard exists. It was added because a half-built region would report near-zero
// overlaps, which is indistinguishable from a clean one -- a false pass. Running with --starve, which skips the build
// wait entirely, still reports 616-676 walls: __hcBRX.walkTo builds the region synchronously, so that starved sample
// cannot be produced by querying too early, and this harness was never actually at risk. The guard stays as a cheap
// invariant in case walkTo ever becomes asynchronous, and --minwalls=N exists so it can be proved to FIRE rather than
// merely to be present, because a guard never observed rejecting anything is not evidence either.
const MIN_WALLS = (()=>{ const a=process.argv.find(x=>x.startsWith('--minwalls=')); return a?+a.slice(11):250; })();
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  let fail=false, aborted=false, page=null;
  // Wait for a STATE, not a duration — same fix the sibling harnesses took.
  const settleFor = async (expr, pred, ms=20000) => { const t0=Date.now();
    for(;;){ const v = await page.evaluate(expr); if(pred(v)) return v;
      if(Date.now()-t0>ms) return v; await sleep(150); } };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=4'+FLAGS, { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:90000});
    await sleep(2500);

    // ---------- enter the backrooms ----------
    await page.evaluate('__hcBR.tp(0,0)');
    await sleep(4000);
    const st = await page.evaluate('__hcBRX.stats()');
    console.log('inside the backrooms: infinite='+st.infinite+'  loaded chunks='+st.loaded);

    // ---------- CONTROL: prove the query can fire ----------
    const base0 = await page.evaluate('__hcBRX.wallOverlaps()');
    const inj   = await page.evaluate('__hcBRX.injectOverlap()');
    if(!inj){ console.log('ABORT: no walls to clone — the region did not build.'); process.exit(1); }
    const withInj = await page.evaluate('__hcBRX.wallOverlaps()');
    const cleared = await page.evaluate('__hcBRX.clearInjected()');
    const after   = await page.evaluate('__hcBRX.wallOverlaps()');
    const caught  = withInj.overlaps > base0.overlaps;
    console.log('CONTROL  cloned one wall onto itself -> overlaps '+base0.overlaps+' -> '+withInj.overlaps
                +'   '+(caught?'CAUGHT — the query can fire':'NOT CAUGHT — THE QUERY IS VACUOUS'));
    if(!caught){ console.log('ABORT: a check that cannot fail is not evidence.'); process.exit(1); }
    if(after.overlaps!==base0.overlaps){ console.log('WARN: control not fully removed ('+cleared+' cleared, '+after.overlaps+' vs '+base0.overlaps+')'); }

    // ---------- the real regions ----------
    let total=0, sites=0, worst=0;
    for(const [gx,gz] of [[0,0],[1,0],[0,1],[1,1],[2,0],[-1,0],[0,-1],[-1,-1]]){
      await page.evaluate('__hcBRX.walkTo('+gx+','+gz+')');
      // Wait for the region to BUILD rather than betting on how long building takes. --starve skips this deliberately,
      // to show the guard below catching a thin sample instead of reporting its near-zero overlaps as success.
      if(!STARVED) await settleFor('__hcBRX.wallOverlaps().walls', v => v >= MIN_WALLS);
      const r = await page.evaluate('__hcBRX.wallOverlaps()');
      sites++; total+=r.overlaps; worst=Math.max(worst,r.worst||0);
      console.log('  region '+String(gx).padStart(3)+','+String(gz).padStart(3)+'   walls='+String(r.walls).padStart(5)
        +'  OVERLAPS='+String(r.overlaps).padStart(4)+'  worst='+(r.worst||0).toFixed(2));
      if(r.overlaps && r.sample && r.sample.length) console.log('    ex '+JSON.stringify(r.sample.slice(0,2)));
      // THE GUARD. Zero overlaps in a half-built region is indistinguishable from a clean one, so a thin sample must not
      // be allowed to read as success. Same shape as assert-shrub-seat's "sample too thin to mean anything".
      if(r.walls < MIN_WALLS){
        console.log('    ABORT: only '+r.walls+' walls here (floor '+MIN_WALLS+') — too thin to judge. A near-zero overlap'
                    +' count in a region this size is an artefact of it not being built, not evidence that it is clean.');
        aborted=true; break; }
    }
    if(!aborted){
      console.log('\n'+sites+' regions walked, '+total+' wall overlaps, worst span '+worst.toFixed(2));
      if(total>0) fail=true; }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  // ABORT is reported distinctly from FAIL. A thin sample invalidates the total; it is neither evidence of overlaps nor
  // evidence of their absence, and collapsing it into either verdict is what the guard exists to prevent.
  if(aborted){ console.log('RESULT: ABORT — sample too thin to judge. This is NOT a pass.'); process.exit(1); }
  console.log(fail?'RESULT: FAIL':'RESULT: PASS');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
