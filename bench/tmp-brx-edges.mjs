// BRX chunk substrate: the correctness properties the infinite halls rest on.
//   1. AGREEMENT   — two adjacent chunks derive the identical crossing list for the boundary they share, from either side
//   2. ANTISYMMETRY — a stairwell that climbs out of A is the same stairwell that descends into B
//   3. DETERMINISM  — the same query answers the same way every time, and re-seeding reproduces it exactly
//   4. CONNECTIVITY — every edge has at least one crossing, so no chunk can be sealed off
//   5. MIX          — doors stay the commonest crossing; the stair share follows from BRX_LVD (see the mix test), and
//                     stairs split 50/50 up/down
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0;
const T=(name,ok,detail)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+name+(detail!==undefined?('  '+JSON.stringify(detail)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:800,height:600}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});

    const R = await page.evaluate(`(()=>{
      const out={ agree:0, disagree:[], anti:0, antiBad:[], det:0, detBad:[], empty:[], kinds:{0:0,1:0,2:0}, up:0, down:0, edges:0, span:__hcBRX.SPAN, cells:__hcBRX.CELLS };
      const key=(l)=>l.map(c=>c.cell+':'+c.kind+':'+c.dir+':'+c.at.toFixed(6)).join('|');
      for(let gx=-12; gx<=12; gx++) for(let gz=-12; gz<=12; gz++){
        for(const [dgx,dgz] of [[1,0],[0,1]]){
          const a=__hcBRX.edge(gx,gz,gx+dgx,gz+dgz);          // asked from the lower chunk
          const b=__hcBRX.edge(gx+dgx,gz+dgz,gx,gz);          // asked from the higher chunk
          out.edges++;
          if(key(a)===key(b)) out.agree++; else if(out.disagree.length<4) out.disagree.push({gx,gz,dgx,dgz,a:key(a),b:key(b)});
          if(!a.length) out.empty.push([gx,gz,dgx,dgz]);
          // antisymmetry of stair direction as seen from each side
          const fa=__hcBRX.edgeFrom(gx,gz,dgx,dgz), fb=__hcBRX.edgeFrom(gx+dgx,gz+dgz,-dgx,-dgz);
          let ok=fa.length===fb.length;
          for(let i=0;i<fa.length&&ok;i++) ok = (fa[i].cell===fb[i].cell && fa[i].kind===fb[i].kind && fa[i].dir===-fb[i].dir);
          if(ok) out.anti++; else if(out.antiBad.length<4) out.antiBad.push({gx,gz,dgx,dgz,fa,fb});
          // determinism: ask again
          if(key(__hcBRX.edge(gx,gz,gx+dgx,gz+dgz))===key(a)) out.det++; else out.detBad.push([gx,gz,dgx,dgz]);
          for(const c of a){ out.kinds[c.kind]++; if(c.kind===2){ if(c.dir>0)out.up++; else out.down++; } }
        } }
      // LEVELS: deterministic per chunk, spread over all storeys, and every stairwell must match the real storey gap
      out.lv={}; out.lvDet=0; out.lvBad=[]; out.stairOK=0; out.stairBad=[]; out.flatBad=[]; out.riseHist={};
      for(let gx=-12; gx<=12; gx++) for(let gz=-12; gz<=12; gz++){
        const L=__hcBRX.level(gx,gz); out.lv[L]=(out.lv[L]|0)+1;
        if(__hcBRX.level(gx,gz)===L) out.lvDet++; else out.lvBad.push([gx,gz]);
        if(__hcBRX.baseY(gx,gz)!==40+L*9) out.lvBad.push(['baseY',gx,gz]);
        for(const [dgx,dgz] of [[1,0],[0,1]]){
          const gap=__hcBRX.level(gx+dgx,gz+dgz)-L, list=__hcBRX.edgeFrom(gx,gz,dgx,dgz);
          for(const c of list){
            if(c.kind===2){ if(c.dir===Math.sign(gap) && c.rise===Math.abs(gap) && gap!==0) out.stairOK++;
              else if(out.stairBad.length<4) out.stairBad.push({gx,gz,dgx,dgz,gap,dir:c.dir,rise:c.rise});
              out.riseHist[c.rise]=(out.riseHist[c.rise]|0)+1; }
            else if(gap!==0 && c.kind!==2 && list.every(q=>q.kind!==2) && out.flatBad.length<4) out.flatBad.push({gx,gz,dgx,dgz,gap});
          } } }
      out.notNeighbour = __hcBRX.edge(0,0,2,0);              // must be null
      out.chunkOf = __hcBRX.chunkOf(__hcBRX.entry().x, __hcBRX.entry().z);
      out.LEVELS=__hcBRX.LEVELS;
      out.originRound = (()=>{ const o=__hcBRX.origin(3,-2); const c=__hcBRX.chunkOf(o.x+1,o.z+1); return (c.gx===3&&c.gz===-2); })();
      return out; })()`);

    T('every shared edge agrees from both sides', R.disagree.length===0, {edges:R.edges, agree:R.agree, sample:R.disagree[0]});
    T('stair direction is antisymmetric across the boundary', R.antiBad.length===0, {ok:R.anti, sample:R.antiBad[0]});
    T('queries are deterministic on repeat', R.detBad.length===0, {ok:R.det});
    T('no edge is left with zero crossings', R.empty.length===0, {empty:R.empty.slice(0,3)});
    T('non-adjacent chunks return null', R.notNeighbour===null);
    T('chunkOf/origin round-trip', R.originRound===true);
    const tot=R.kinds[0]+R.kinds[1]+R.kinds[2];
    const pd=100*R.kinds[0]/tot, pt=100*R.kinds[1]/tot, ps=100*R.kinds[2]/tot;
    // The stair share is NOT a free parameter — it falls out of BRX_LVD. Every crossing on a storey-changing boundary has
    // to be a stairwell (else it leads nowhere), so smaller level districts mean proportionally more stairs. At LVD=4 the
    // mix measured 64/22/15; at LVD=2, which Ben asked for so stairs come up sooner, it is 54/17/30. Assert a band that
    // holds for either, plus the invariant that actually matters: doors stay the commonest crossing.
    T('connector mix: doors dominant, tunnels present, stairs 12-35%',
      pd>50 && pd<70 && pt>12 && pt<26 && ps>12 && ps<35 && pd>ps,
      {door:+pd.toFixed(1),tunnel:+pt.toFixed(1),stair:+ps.toFixed(1),n:tot,LVD:2});
    const pu=100*R.up/(R.up+R.down);
    T('stairs split ~50/50 up/down', pu>40&&pu<60, {up:R.up,down:R.down,pctUp:+pu.toFixed(1)});
    T('chunk levels are deterministic and baseY follows', R.lvBad.length===0, {ok:R.lvDet, bad:R.lvBad.slice(0,2)});
    T('all storeys are used', Object.keys(R.lv).length===R.LEVELS, {used:R.lv, LEVELS:R.LEVELS});
    T('every stairwell matches the real storey gap', R.stairBad.length===0, {ok:R.stairOK, sample:R.stairBad[0], rises:R.riseHist});
    // With BRX_LEVELS=2 the gap between two districts can only be 1, so a flight is never more than one storey.
    T('no flight is longer than one storey', Object.keys(R.riseHist).every(k=>+k<=R.LEVELS-1), {rises:R.riseHist, LEVELS:R.LEVELS});
    T('no boundary changes storey without a stairwell', R.flatBad.length===0, {sample:R.flatBad[0]});

    // re-seeding must reproduce byte-for-byte
    const before = await page.evaluate(`(()=>{ const l=__hcBRX.edge(4,7,5,7); return l.map(c=>c.cell+':'+c.kind+':'+c.dir).join('|'); })()`);
    await page.evaluate(`window.__hcBR.seed(555)`); await sleep(300);
    const other  = await page.evaluate(`(()=>{ const l=__hcBRX.edge(4,7,5,7); return l.map(c=>c.cell+':'+c.kind+':'+c.dir).join('|'); })()`);
    await page.evaluate(`window.__hcBR.seed(99991)`); await sleep(300);
    const again  = await page.evaluate(`(()=>{ const l=__hcBRX.edge(4,7,5,7); return l.map(c=>c.cell+':'+c.kind+':'+c.dir).join('|'); })()`);
    T('a different world seed gives a different edge', before!==other, {before,other});
    T('returning to the original seed reproduces it exactly', before===again, {before,again});
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? (fails+' FAILURE(S)') : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
