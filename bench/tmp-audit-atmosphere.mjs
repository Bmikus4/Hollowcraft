// AUDIT OF WHAT I SHIPPED: a number AND a frame for each claim (Ben 08-16, via the orchestrator).
//
// The rule of the audit: the frame decides how it LOOKS, the number decides how it BEHAVES, and where they disagree
// that is the finding rather than a tie to be broken quietly. Two features today were provably invisible while their
// own counters read healthy - puddles drawing a block underground with drawn:20, and the volumetric pass reading a
// userData flag that does not exist - so every check here toggles the thing against ITSELF and reads the same crop.
// A statistic that does not change when the feature is switched off is not measuring the feature.
//
// Claims under audit, all of them Ben's own complaints:
//   PINES 1 - the band EDGES do not show as a seam
//   PINES 2 - the treeline does not SINK below the horizon
//   PINES 3 - it PARALLAXES against the horizon as you move
//   MTN     - the ranges stand against the sky, and the snow is on them
//   FOG     - day and dusk fog read as depth, not as a grey wash
//
//   node bench/tmp-audit-atmosphere.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
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
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const logs=[]; page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.dayLock&&__hc.dayLock(0.30);`);

    // One shot helper: writes the PNG and returns per-row luminance of a band of the image, so a horizon can be found
    // rather than assumed. Reading rows is what answers "does the treeline sink" - a single mean cannot.
    let n=0;
    const shot=async(tag,box)=>{ const f=path.join(OUT,'audit-'+tag+'.png'); await page.screenshot({path:f});
      const b64=fs.readFileSync(f).toString('base64');
      const r=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${b64}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const X=${box[0]}, Y=${box[1]}, W=${box[2]}, H=${box[3]};
        const d=g.getImageData(X,Y,W,H).data; const rows=[]; let s=0,nn=0;
        for(let y=0;y<H;y++){ let rs=0; for(let x=0;x<W;x++){ const i=(y*W+x)*4; const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; rs+=L; s+=L; nn++; } rows.push(+(rs/W).toFixed(2)); }
        return { mean:+(s/nn).toFixed(3), rows }; })()`);
      return r; };

    const IC=await page.evaluate(`__hc.island()`);
    const SEA=await page.evaluate(`__hc.island().sea`).catch(()=>62);
    // Stand OUT TO SEA looking back at the island: that is the vantage every pine complaint was made about, and the
    // only one where a treeline has a horizon to sink below.
    const vx=IC.cx-IC.R-90, vz=IC.cz;
    await page.evaluate(`__hc.tpAt(${vx}, ${SEA}+26, ${vz}); __hc.cam({yaw:${Math.atan2(0,1)}, pitch:-0.02}); __hc.pinScene();`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2500);
    console.log(`  vantage ${vx.toFixed(0)},${vz.toFixed(0)} looking at the island (centre ${IC.cx},${IC.cz} R ${IC.R})`);
    console.log(`  pines   ${JSON.stringify(await page.evaluate(`__hc.pines()`))}`);

    // ---- WHICH BEARING ARE THE PINES ON? Toggling them at one guessed vantage produced a change of 0.158 against a
    // drift of 0.570 - not on the screen - and the sink and parallax checks below then measured a treeline that was
    // not there and reported two confident failures about it. The bands were removed at Ben's instruction and one
    // bearing is deliberately empty (backlog 10/12/14), so WHICH bearing is a question this has to ask rather than
    // assume. The mountains changed the same frame by 15.658, so the camera is certainly pointed at the island.
    const BOX=[0,180,1280,340];
    const sweep=[];
    for(let a=0;a<8;a++){ const th=a*Math.PI/4;
      const sx=IC.cx+Math.cos(th)*(IC.R+90), sz=IC.cz+Math.sin(th)*(IC.R+90);
      const yaw=Math.atan2(-(IC.cx-sx), -(IC.cz-sz));
      await page.evaluate(`__hc.tpAt(${sx}, ${SEA}+26, ${sz}); __hc.cam({yaw:${yaw}, pitch:-0.02}); __hc.pinScene();`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(1800);
      await page.evaluate(`__hc.pines(1)`); const a1=await shot('sweep'+a+'-on',BOX);
      await page.evaluate(`__hc.pines(0)`); const a0=await shot('sweep'+a+'-off',BOX);
      await page.evaluate(`__hc.pines(1)`); const a2=await shot('sweep'+a+'-on2',BOX);
      const dr=Math.abs(a2.mean-a1.mean), ch=Math.abs(((a1.mean+a2.mean)/2)-a0.mean);
      sweep.push({a, deg:Math.round(th*180/Math.PI), x:Math.round(sx), z:Math.round(sz), ch:+ch.toFixed(3), dr:+dr.toFixed(3)});
      console.log(`  sweep ${String(Math.round(th*180/Math.PI)).padStart(3)}deg at ${Math.round(sx)},${Math.round(sz)}   pines change ${ch.toFixed(3)}  drift ${dr.toFixed(3)}${ch>Math.max(0.05,dr)?'   <== VISIBLE':''}`);
    }
    const live=sweep.filter(s=>s.ch>Math.max(0.05,s.dr));
    console.log(`  PINES VISIBLE ON ${live.length} OF 8 BEARINGS${live.length?': '+live.map(s=>s.deg+'deg('+s.ch+')').join(', '):''}`);
    check('the coast pines render on at least one bearing', live.length>0, `${live.length}/8 bearings`);
    if(live.length){ const b=live.sort((p,q)=>q.ch-p.ch)[0];
      const yaw=Math.atan2(-(IC.cx-b.x), -(IC.cz-b.z));
      await page.evaluate(`__hc.tpAt(${b.x}, ${SEA}+26, ${b.z}); __hc.cam({yaw:${yaw}, pitch:-0.02}); __hc.pinScene();`);
      await sleep(2200); console.log(`  sink/parallax will be measured at ${b.deg}deg, the strongest bearing (${b.ch})`); }
    else console.log('  sink and parallax SKIPPED - there is no treeline on any bearing to measure.');
    await page.evaluate(`__hc.pines(1)`); const pOn=await shot('pines-on',BOX);
    await page.evaluate(`__hc.pines(0)`); const pOff=await shot('pines-off',BOX);
    await page.evaluate(`__hc.pines(1)`); const pOn2=await shot('pines-on2',BOX);
    const pDrift=Math.abs(pOn2.mean-pOn.mean), pChange=Math.abs(((pOn.mean+pOn2.mean)/2)-pOff.mean);
    console.log(`  PINES   crop on ${pOn.mean}  off ${pOff.mean}  on-again ${pOn2.mean}   change ${pChange.toFixed(3)}  drift ${pDrift.toFixed(3)}`);
    check('the pines are actually on the screen', pChange>Math.max(0.05,pDrift), `change ${pChange.toFixed(3)} vs drift ${pDrift.toFixed(3)}`);

    // PINES 2 - THE SINK. The treeline must sit ABOVE the water horizon. Find the horizon as the row of steepest
    // luminance fall in the pines-OFF frame (sky over sea, with no treeline in the way), then find the lowest row the
    // pines themselves change by more than a threshold. If that row is BELOW the horizon the treeline has sunk.
    const dRow=(a,b)=>a.rows.map((v,i)=>Math.abs(v-b.rows[i]));
    let hz=0, best=0;
    for(let i=1;i<pOff.rows.length;i++){ const d=Math.abs(pOff.rows[i]-pOff.rows[i-1]); if(d>best){ best=d; hz=i; } }
    const diff=dRow(pOn,pOff); let lowest=-1;
    for(let i=0;i<diff.length;i++) if(diff[i]>1.0) lowest=i;
    console.log(`  SINK    horizon row ${hz} (step ${best.toFixed(2)}), lowest row the pines touch ${lowest}   [rows are ${BOX[1]}..${BOX[1]+BOX[3]} of the frame, larger = lower]`);
    check('the treeline does not hang below the water horizon', lowest>=0 && lowest<=hz+6, `lowest ${lowest} vs horizon ${hz}`);

    // PINES 1 - THE EDGES. A band seam is a HARD step in a column of the treeline. Compare the biggest row-to-row jump
    // inside the treeline against the horizon's own step: the horizon is a real edge, so a seam that rivals it is
    // visible, and one far below it is not.
    let seam=0, seamRow=-1;
    for(let i=Math.max(1,hz-120); i<hz-4; i++){ const d=Math.abs(pOn.rows[i]-pOn.rows[i-1]); if(d>seam){ seam=d; seamRow=i; } }
    console.log(`  EDGES   sharpest step inside the treeline ${seam.toFixed(2)} at row ${seamRow}, against the horizon's own ${best.toFixed(2)}`);
    check('no band seam rivals the horizon edge', seam < best*0.6, `seam ${seam.toFixed(2)} vs horizon ${best.toFixed(2)}`);

    // PINES 3 - PARALLAX. Move ALONG the coast and the treeline must shift against the horizon. Measured as the
    // column-shift that best matches the before and after crops - a treeline painted on the sky would score 0.
    const colsOf=async(tag)=>{ const f=path.join(OUT,'audit-'+tag+'.png'); await page.screenshot({path:f});
      const b64=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${b64}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const Y=${hz+BOX[1]-70}, H=60, d=g.getImageData(0,Y,1280,H).data, out=[];
        for(let x=0;x<1280;x++){ let s=0; for(let y=0;y<H;y++){ const i=(y*1280+x)*4; s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; } out.push(s/H); }
        return out; })()`); };
    const c0=await colsOf('par-a');
    await page.evaluate(`__hc.tpAt(${vx}, ${SEA}+26, ${vz}+15); __hc.pinScene();`); await sleep(2200);
    const c1=await colsOf('par-b');
    let bestShift=0, bestScore=-1e18;
    for(let s=-90;s<=90;s++){ let dot=0,nn=0;
      for(let x=140;x<1140;x++){ const j=x+s; if(j<0||j>=1280) continue; dot-=Math.abs(c0[x]-c1[j]); nn++; }
      const sc=dot/Math.max(1,nn); if(sc>bestScore){ bestScore=sc; bestShift=s; } }
    console.log(`  PARALLAX treeline shifted ${bestShift} px for 15 blocks of travel along the coast`);
    check('the treeline parallaxes rather than being painted on the sky', Math.abs(bestShift)>=6, `${bestShift} px`);

    // ---- MOUNTAINS + SNOW, toggled against themselves at the same vantage.
    await page.evaluate(`__hc.tpAt(${vx}, ${SEA}+26, ${vz}); __hc.pinScene();`); await sleep(2000);
    console.log(`  mtn     ${JSON.stringify(await page.evaluate(`__hc.mtn()`))}`);
    const MB=[0,150,1280,220];
    await page.evaluate(`__hc.mtn(1)`); const mOn=await shot('mtn-on',MB);
    await page.evaluate(`__hc.mtn(0)`); const mOff=await shot('mtn-off',MB);
    await page.evaluate(`__hc.mtn(1)`); const mOn2=await shot('mtn-on2',MB);
    const mDrift=Math.abs(mOn2.mean-mOn.mean), mChange=Math.abs(((mOn.mean+mOn2.mean)/2)-mOff.mean);
    console.log(`  MTN     crop on ${mOn.mean}  off ${mOff.mean}  on-again ${mOn2.mean}   change ${mChange.toFixed(3)}  drift ${mDrift.toFixed(3)}`);
    check('the ranges are on the screen at all', mChange>Math.max(0.05,mDrift), `change ${mChange.toFixed(3)} vs drift ${mDrift.toFixed(3)}`);

    // ---- FOG, day and dusk: it must CHANGE the frame and it must not simply flatten it. Reported, not asserted -
    // "reads as depth" is a look judgement and belongs to the frames, which are written for the eye.
    for(const [tag,t] of [['noon',0.30],['dusk',0.78]]){
      await page.evaluate(`__hc.dayLock&&__hc.dayLock(${t})`); await sleep(1400);
      const fi=await page.evaluate(`__hc.fogInfo()`);
      await page.evaluate(`__hc.fog&&__hc.fog(0)`); await sleep(900); const f0=await shot('fog-'+tag+'-clear',BOX);
      await page.evaluate(`__hc.fog&&__hc.fog(0.6)`); await sleep(900); const f1=await shot('fog-'+tag+'-bank',BOX);
      await page.evaluate(`__hc.fog&&__hc.fog(0)`); await sleep(600);
      console.log(`  FOG ${tag}  density ${fi.density&&fi.density.toFixed?fi.density.toFixed(5):fi.density}  reach ${fi.reach&&fi.reach.toFixed?fi.reach.toFixed(1):fi.reach}  colourLum ${fi.colorLum?fi.colorLum.toFixed(3):'?'}  day ${fi.day}   crop clear ${f0.mean} -> bank ${f1.mean}`);
      check(`the ${tag} fog bank changes the frame`, Math.abs(f1.mean-f0.mean)>0.5, `${f0.mean} -> ${f1.mean}`);
    }
    console.log('  logs: '+(logs.length?logs.slice(0,3).join(' | '):'(none)'));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
