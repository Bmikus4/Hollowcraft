// CATCH A MAZE THAT BLOCKS AN OPENING, AND NAME WHICH STOREY'S SLAB IS DOING IT.
//
// br-invisible.mjs found 4 of 164 openings voxel-solid at chest height in one maze of three: a leafless frame solid
// across all five samples of its span, a door across three of five. brSlabColumn is what makes that possible and also
// what makes it diagnosable — it writes bedrock, concrete below FLOOR, carpet AT FLOOR, a ceiling at topY and NOTHING in
// between, and `FLOOR = brxChunkBaseY(gx,gz)` is taken PER BRX CHUNK. So a solid cell at chest height is not a carve
// that failed, it is a carve that ran against a different storey's floor height. A doorway sitting on a chunk boundary
// has a column on each side, and if those two chunks are on different levels then one side's FLOOR SLAB stands at the
// other side's chest height. That is an open doorway you cannot walk through, and it is also a block with nothing drawn
// in it, which is how one bug produces two of Ben's four complaints.
//
// The measurement, per span sample of every opening: which chunk the column belongs to, that chunk's base Y, and where
// the CARPET and CEILING blocks actually sit in the column. Carpet at anything other than the chunk's own base Y is the
// bug, stated as two numbers that disagree.
//
// Seeds are swept in ONE page through __hcBR.seed(), which clears both caches and re-streams, so many mazes cost one
// browser instead of one browser each. No Math.random anywhere: the seed list is fixed, so this rerun is the same rerun.
//
// usage: node bench/br-storey.mjs      (HC_ROOT=<pinned tree>)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT=process.env.HC_ROOT||'D:/code/Minecraft';
const REPO='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);

const PROBE = `
window.__ST={
  ids(){ return { carpet:BID.br_carpet, ceiling:BID.br_ceiling, concrete:BID.br_concrete,
                  BR_FLOOR, BR_CH, levels:!!BR.levels, cells:BRX_CELLS }; },
  // Every opening the halls have, not just the ones with a leaf in them: doors, leafless frames, lintels (doorways and
  // archways) and crawl passages. Each is sampled across its span, because a doorway blocked on one side only is exactly
  // what a storey boundary running through it would produce.
  openings(){ const out=[];
    const add=(kind,cx,cz,vert,w,extra)=>out.push({kind, cx, cz, vert:!!vert, w, extra:extra||null});
    for(const d of (BR.doors||[])) add('door', d.cx, d.cz, d.vert, d.dw||2);
    for(const f of (BR.frames||[])) add('frame', f.cx, f.cz, f.vert, f.dw||2);
    for(const l of (BR.lintels||[])){ const c=(l.s0+l.s1)/2, w=l.s1-l.s0;
      add(l.arch?'arch':'lintel', l.vert?l.fixed:c, l.vert?c:l.fixed, l.vert, w); }
    for(const c of (BR.crawls||[])) add('crawl', (c.x0+c.x1)/2, (c.z0+c.z1)/2, Math.abs(c.x1-c.x0)<0.01,
      Math.max(Math.abs(c.x1-c.x0), Math.abs(c.z1-c.z0)));
    return out; },
  // THE COLUMN, AS THE CARVE SEES IT. base is what brSlabColumn would use for this exact column; carpetY/ceilY are where
  // the slab and lid actually ended up. base !== carpetY means the voxels under this cell were laid for another storey.
  col(x,z){
    const bc=brxChunkOf(x,z), base=BR.levels? brxChunkBaseY(bc.gx,bc.gz) : BR_FLOOR;
    const X=Math.floor(x), Z=Math.floor(z);
    let carpetY=null, ceilY=null, solidAtChest=false, solidAtHead=false;
    for(let y=BR_FLOOR-2; y<=BR_FLOOR+BRX_LEVELS*BR_CH+1; y++){
      const b=getBlock(X,y,Z);
      if(b===BID.br_carpet && carpetY===null) carpetY=y;
      if(b===BID.br_ceiling && ceilY===null && y>base) ceilY=y; }
    solidAtChest = solidAt(X, base+2, Z); solidAtHead = solidAt(X, base+1, Z);
    return { ck:bc.gx+'_'+bc.gz, base, carpetY, ceilY, blockedAtBasePlus1:!!solidAtHead, blockedAtBasePlus2:!!solidAtChest,
             mismatch: carpetY!==null && carpetY!==base }; },
  // One maze: every opening, five samples across each, and the columns that block a body reported in full.
  scan(){
    const ops=this.openings(); const bad=[]; let checked=0, blockedOps=0, straddling=0;
    for(const o of ops){ const rows=[]; let blocked=0; const cks=new Set();
      for(let i=0;i<5;i++){ const t=(i/4-0.5)*(o.w*0.8), x=o.cx+(o.vert?0:t), z=o.cz+(o.vert?t:0);
        const c=this.col(x,z); c.at=[+x.toFixed(1),+z.toFixed(1)]; cks.add(c.ck); rows.push(c); checked++;
        if(c.blockedAtBasePlus1 || c.blockedAtBasePlus2) blocked++; }
      if(cks.size>1) straddling++;                                   // this opening sits ON a chunk boundary
      if(blocked){ blockedOps++;
        if(bad.length<6) bad.push({ kind:o.kind, at:[+o.cx.toFixed(1),+o.cz.toFixed(1)], w:+o.w.toFixed(2),
          blocked, straddlesChunks:cks.size>1, chunks:[...cks], samples:rows }); } }
    return { openings:ops.length, columnsChecked:checked, blockedOpenings:blockedOps, openingsOnAChunkBoundary:straddling,
             seed:BR.seed>>>0, worst:bad }; },
  // Does the storey oracle actually disagree across the loaded set? If every loaded chunk is on one level, a storey
  // boundary cannot be the cause here and the lead is dead for this maze.
  levels(){ const rows=(BR.loaded||[]).map(r=>({ ck:r.gx+'_'+r.gz, base: BR.levels? brxChunkBaseY(r.gx,r.gz) : BR_FLOOR }));
    const set=[...new Set(rows.map(r=>r.base))].sort((a,b)=>a-b);
    return { levelsOn:!!BR.levels, distinctBaseY:set, chunks:rows }; },
  // THE REPAIR, ON DEMAND. brReslab re-lays every column of every stale chunk within radius CHUNKS and marks it for
  // remesh. brEnter calls brReslabStale(10) and the per-frame stream tick calls brReslabStale(6); __hcBR.seed calls
  // neither, which is why a QA reseed leaves stale slabs a real entry would have repaired. If this clears the blockage
  // then the signature IS the stale slab and nothing else.
  repair(r){ try{ const n=brReslabStale(r||10); return { chunksRelaid:n }; }catch(e){ return {err:String(e&&e.message||e)}; } },
  reseed(v){ try{ const s=__hcBR.seed(v); return { seed:s, loaded:(BR.loaded||[]).length, doors:(BR.doors||[]).length }; }
             catch(e){ return {err:String(e&&e.message||e)}; } }
};`;

function ensureProbe(root){
  const f=path.join(root,'index.html'); let s=fs.readFileSync(f,'utf8');
  if(s.includes('window.__ST=')) return 'already patched';
  if(path.resolve(root).toLowerCase()===path.resolve(REPO).toLowerCase())
    throw new Error('refusing to patch the shared checkout — pin a tree and set HC_ROOT');
  const a='PERF.T = T; PERF.TID = TID; PERF.TN = TN;';
  if(!s.includes(a)) throw new Error('probe anchor missing');
  fs.writeFileSync(f, s.replace(a, a+PROBE));
  return 'patched';
}

(async()=>{
  console.log('probe: '+ensureProbe(ROOT));
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling','--disable-gpu-vsync','--disable-frame-rate-limit'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,180)));
    const ev=async(js)=>{ try{ return await page.evaluate(js); }catch(e){ return {err:String(e.message||e).slice(0,200)}; } };

    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(7000);
    await ev('__hc.cmdRun("/gamemode creative")'); await ev('__hcPERF.arm()');
    console.log('enter:  '+J(await ev('__hcPERF.enterBR()')));
    await sleep(3000);
    console.log('ids:    '+J(await ev('__ST.ids()')));
    console.log('levels: '+J(await ev('__ST.levels()')));

    // Fixed seed list, so a rerun is the same rerun. Sweeping in one page: __hcBR.seed clears both caches and re-streams.
    const seeds=[4242,99991,7,1234567,20260805,31337,555,90210,161803,271828,112358,8675309];
    let caught=0;
    for(const sd of seeds){
      const r=await ev('__ST.reseed('+sd+')'); await sleep(900);
      const sc=await ev('__ST.scan()');
      if(!sc || sc.err){ console.log('seed '+sd+': '+J(sc)); continue; }
      console.log('seed '+sd+': openings '+sc.openings+', columns '+sc.columnsChecked+', BLOCKED '+sc.blockedOpenings
                  +', onChunkBoundary '+sc.openingsOnAChunkBoundary+' (doors '+(r&&r.doors)+')');
      if(sc.blockedOpenings){
        caught++;
        const s0=sc.worst[0];
        console.log('   one blocked '+s0.kind+' at '+J(s0.at)+' chunk '+J(s0.chunks)+' straddles '+s0.straddlesChunks
                    +' -> base '+s0.samples[0].base+' but carpetY '+s0.samples[0].carpetY+' ceilY '+s0.samples[0].ceilY);
        console.log('   levels: '+J((await ev('__ST.levels()')).distinctBaseY));
        // FIRST: does the game repair itself now, with nobody calling the repair by hand? brReslabStaleAny runs in the
        // stream tick, two chunks a frame, so a few seconds of frames is the honest test of the shipped behaviour.
        await sleep(4000);
        const self=await ev('__ST.scan()');
        console.log('   AFTER 4s OF FRAMES, no manual repair: blockedOpenings '+self.blockedOpenings+' of '+self.openings);
        console.log('   repair: '+J(await ev('__ST.repair(10)')));
        await sleep(800);
        const after=await ev('__ST.scan()');
        console.log('   AFTER REPAIR: blockedOpenings '+after.blockedOpenings+' of '+after.openings
                    +' (was '+sc.blockedOpenings+'), sample col: '+J(after.worst[0]?after.worst[0].samples[0]:null));
        if(caught>=2) break;
      }
    }
    console.log('page errors: '+(errs.length?errs.slice(0,6).join(' | '):'none'));
    await browser.close();
  }catch(e){ console.log('HARNESS ERROR: '+(e&&e.stack||e)); }
  finally{ try{ server.kill(); }catch(e){} process.exit(0); }
})();
