// #74 — FLOWING WATER. The roster says the DIRECTION FIELD is the hard part and the scroll is not, so most of this
// harness is about the field's semantics and only the last section looks at the screen.
//
// The field is one pure function of world x,z (flowVec), sampled on an 8-block lattice and bilinearly interpolated,
// baked into the water mesh as the vec2 attribute aFlow and consumed by BOTH shader stages as a single subtraction:
// every pattern on that surface is a function of xz, so evaluating it at xz - v*t makes the whole surface travel at v.
// Where the field is zero the subtraction is of zero and the water is bit-identical to the sea Ben has already signed
// off on — that property is what check 6 and check 13 exist to protect.
//
//   1  a river carries a current, and it runs ALONG its channel rather than into its own bank
//   2  the ocean rolls IN at the waterline (the roster's inverted mask, as a sign flip)
//   3  and DRIFTS SEAWARD further out, through a slack band, with no discontinuity
//   4  open ocean out of reach of any coast is still, and so is the far-sea disc — #59's water does not move
//   5  the field is a pure function: same coordinate, same vector, every time, on every client
//   6  and it is continuous — no seam between lattice cells
//   7  the mesh actually carries it (a flowVec that works while waterMesh forgets the attribute is invisible)
//   8  both shader stages advect, read off the source that compiled
//   9  THE PICTURE MOVES ALONG IT, and reverses when the field is reversed. That is the item.
// usage: node bench/assert-flow.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

// A centred grey crop. ch is 3 on an opaque screenshot and stepping by a hard 4 walks the channels out of phase, which
// is how a luma probe ends up mixing three pixels per sample.
function grey(buf, S, cxf=0.5, cyf=0.5){
  const img=decodePNG(buf), {w,h,ch,data}=img;
  const x0=Math.round(w*cxf-S/2), y0=Math.round(h*cyf-S/2), out=new Float32Array(S*S);
  for(let y=0;y<S;y++){ const r=(y0+y)*w*ch;
    for(let x=0;x<S;x++){ const i=r+(x0+x)*ch; out[y*S+x]=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; } }
  return out;
}
// HIGH-PASS, and this is the difference between a measurement and a coin toss. What makes the water's normals VISIBLE is
// the sun glade, and the glade's envelope is a function of where the camera and the sun are, not of where the water is:
// it sits still in the frame while the pattern inside it travels. Correlating the raw crop measures the envelope and
// returns a zero shift with a rising residual — which is exactly what the first version of this check reported. Turning
// the glade off is not the answer either: measured with __hc.glade({amt:0}), a down-looking crop of river has a standard
// deviation of 0.5 luma out of a mean of 30, i.e. the surface is featureless without it. Subtracting a local box mean
// keeps the travelling structure and throws away the envelope it is riding on.
function highpass(a, S, r=5){
  const out=new Float32Array(S*S);
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){
    let s=0,n=0;
    for(let dy=-r;dy<=r;dy++){ const yy=y+dy; if(yy<0||yy>=S) continue;
      for(let dx=-r;dx<=r;dx++){ const xx=x+dx; if(xx<0||xx>=S) continue; s+=a[yy*S+xx]; n++; } }
    out[y*S+x]=a[y*S+x]-s/n;
  }
  return out;
}
// The integer screen shift that best aligns B onto A, by minimum mean absolute difference over a margin-trimmed window.
// This is what "the pattern moved" means as a number; a frame diff can only say "something changed".
function bestShift(A, B, S, R){
  let best={dx:0,dy:0,score:1e9};
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    let s=0, n=0;
    for(let y=R;y<S-R;y+=2) for(let x=R;x<S-R;x+=2){ s+=Math.abs(A[y*S+x]-B[(y+dy)*S+(x+dx)]); n++; }
    s/=n; if(s<best.score) best={dx,dy,score:+s.toFixed(3)};
  }
  return best;
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.30)');
    await sleep(2500);

    const cen = await page.evaluate('__hc.flowCensus()');
    console.log('  census ' + JSON.stringify(cen));

    console.log('\n--- 1  a river runs along its channel ---');
    if(!cen.river) chk(false,'found a river column within 420 blocks of spawn');
    else{
      chk(cen.river.mag > 0.6, 'the river carries a real current', 'mag '+cen.river.mag+' at '+cen.river.x+','+cen.river.z);
      // ACROSS the bank, not into it. The obvious implementation — steepest descent of the terrain — fails exactly here,
      // because the carve lerps the channel floor FLAT to CFG.SEA-3, so downhill points at the water's own centreline.
      chk(Math.abs(cen.river.dotLand) < 0.6, 'and it runs along the channel rather than into the bank',
        'cos to the nearest-land bearing '+cen.river.dotLand);
    }

    console.log('\n--- 2  the ocean rolls in at the waterline ---');
    if(!cen.shore) chk(false,'found a shore column');
    else{
      chk(cen.shore.mag > 0.05, 'the shallows are moving', 'mag '+cen.shore.mag+' with land '+cen.shore.landR+' away');
      chk(cen.shore.dotLand > 0.5, 'and they are moving LANDWARD — the inflow the roster asks for',
        'cos to land '+cen.shore.dotLand);
    }

    console.log('\n--- 3  and drift seaward once past the slack band ---');
    // Walk straight out from the shore sample along its own landward bearing, reversed, and watch the sign turn over.
    const raw = cen.shore ? await page.evaluate(`__hc.flowLine(${cen.shore.x},${cen.shore.z},${-cen.shore.fx},${-cen.shore.fz},16,4)`) : [];
    // `along` is the component still pointing the way the shallows were: positive is inflow, negative is seaward.
    const walk = raw.map(s=>({ d:s.d, mag:s.mag,
      along:+((s.fx*cen.shore.fx + s.fz*cen.shore.fz)/cen.shore.mag).toFixed(3) }));
    console.log('  offshore ' + JSON.stringify(walk));
    const near=walk.filter(s=>s.d<=8), far=walk.filter(s=>s.d>=28);
    chk(near.length && near.every(s=>s.along>0), 'near the shore the current is landward', JSON.stringify(near.slice(0,2)));
    chk(far.length>0 && far.some(s=>s.along<-0.02), 'further out it has turned seaward', JSON.stringify(far.slice(0,3)));
    chk(walk.length>2 && Math.max(...walk.map(s=>s.mag))<=1.001, 'nothing in the sea exceeds a river', 'max '+Math.max(...walk.map(s=>s.mag)));

    console.log('\n--- 4  open ocean is still, and so is the disc beyond the render wall ---');
    chk(cen.open && cen.open.mag===0, 'water out of reach of any coast does not move',
      cen.open?('mag '+cen.open.mag+' at '+cen.open.x+','+cen.open.z):'no open-ocean sample');
    const disc = await page.evaluate('__hc.flowDisc()');
    chk(!disc.missing && disc.max===0, 'the far-sea disc declares a zero current',
      JSON.stringify(disc)+' — an attribute the shader declares but a geometry omits reads whatever was last bound');

    console.log('\n--- 5  the field is a pure function of position ---');
    const pure = await page.evaluate('__hc.flowPurity(300)');
    chk(pure.same===pure.n, 'the same coordinate gives the same vector', pure.same+'/'+pure.n+' identical, worst drift '+pure.worst);

    console.log('\n--- 6  and continuous across the lattice ---');
    const cont = await page.evaluate(`__hc.flowStep(${cen.river?cen.river.x:0},${cen.river?cen.river.z:0},10)`);
    // THE LATTICE IS THE CEILING. Samples sit 8 blocks apart and the field spans 1.0 (a river) to -0.26 (an offshore
    // drift), so a bilinear interpolation cannot step more than 1.26/8 = 0.16 per block. Anything above that is not
    // interpolation, it is a category boundary landing inside the water — which is how the first version's downstream
    // sign flip showed up: 0.25 in one block, two lattice cells apart, a river running into itself.
    chk(cont.worst < 0.17, 'one block of travel never jumps the current further than the lattice allows',
      'worst step '+cont.worst+' at '+JSON.stringify(cont.at)+' against the 0.16 ceiling');

    console.log('\n--- 7  the mesh carries it ---');
    if(cen.river) await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+7}, ${cen.river.z+0.5})`);
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',null,{timeout:90000}).catch(()=>{});
    await sleep(3000);
    const mesh = await page.evaluate('__hc.flowMesh()');
    console.log('  mesh ' + JSON.stringify(mesh));
    chk(mesh.hasAttr && mesh.meshes>0, 'every water mesh in the world declares aFlow', mesh.meshes+' of '+mesh.withWater+' water meshes');
    chk(mesh.moving>0, 'and some of those vertices are moving', mesh.moving+' of '+mesh.verts+' verts, max '+mesh.maxMag);
    const K = await page.evaluate('__hc.flow()');
    chk(mesh.maxMag<=K.riverSpeed*1.001, 'with nothing over the river speed', 'max '+mesh.maxMag+' against FLOW_RIVER '+K.riverSpeed);

    console.log('\n--- 8  both shader stages advect, read off the compiled source ---');
    const src = await page.evaluate('__hc.flowSrc()');
    console.log('  shader ' + JSON.stringify(src));
    chk(src.vAttr && src.vGain, 'the vertex stage reads the attribute through the gain', JSON.stringify(src));
    chk(src.vAdvect, 'the wave phases are advected', 'the crest pattern travels, not just the texture');
    chk(src.fVary && src.fAdvect, 'the fragment stage advects all six noise octaves', 'one subtraction on uv');

    console.log('\n--- 9  the picture moves along the field, and reverses with it ---');
    // Straight down over the channel from six blocks up, so the crop is water and nothing else. The mapping from world
    // XZ to screen XY does not need deriving: the test is that reversing the SIGN of the field reverses the measured
    // shift, which is true in any orientation.
    if(!cen.river) chk(false,'no river to photograph');
    else{
      await page.evaluate('__hc.stillFrame(true)');
      // Six blocks up, glade ON (see highpass), crop off the reticle: the reticle is a static ring in the middle of the
      // frame and it pulls the best shift toward zero. DT is 150 ms because at this height the surface is about 86 px a
      // block, so a river's 1.0 travels 13 px in that time — inside the search radius, which a 350 ms gap would not be.
      await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+8}, ${cen.river.z+0.5})`); await sleep(1500);
      await page.evaluate(`__hc.look(${cen.river.x+0.51}, ${cen.river.h-10}, ${cen.river.z+0.51})`); await sleep(1500);
      // R has to exceed the true travel or the search silently truncates it: eight blocks up the surface is about 64 px a
      // block, and a river's 1.6 covers 15 px in 150 ms. Three pairs and a median per gain, because a single pair carries
      // whatever jitter that particular 150 ms of sleep and frame pacing had in it.
      const S=180, R=24, DT=150, CX=0.60, CY=0.32;
      const med = a => a.slice().sort((p,q)=>p-q)[a.length>>1];
      const pair = async gain => { await page.evaluate(`__hc.flow({gain:${gain}})`); await sleep(500);
        const xs=[], ys=[], sc=[];
        for(let i=0;i<3;i++){ const a=highpass(grey(await page.screenshot(), S, CX, CY), S); await sleep(DT);
          const b=highpass(grey(await page.screenshot(), S, CX, CY), S); const s=bestShift(a,b,S,R);
          xs.push(s.dx); ys.push(s.dy); sc.push(s.score); }
        return { dx:med(xs), dy:med(ys), score:+med(sc).toFixed(3), runs:xs.map((x,i)=>[x,ys[i]]) }; };
      const zero = await pair(0), plus = await pair(1), minus = await pair(-1);
      await page.evaluate('__hc.flow({gain:1}); __hc.glade({amt:1})');
      console.log('  shift  gain0 ' + JSON.stringify(zero) + '  gain+1 ' + JSON.stringify(plus) + '  gain-1 ' + JSON.stringify(minus));
      // COMPARE +1 AGAINST -1, NOT AGAINST 0. Both of those frames have the same attenuated fixed drift (the shader cuts
      // it wherever there is a current, see `still`), so the drift is common-mode between them and the only thing that
      // differs is the SIGN of the advection: s(+1) - s(-1) is twice the travel, with the busy part of the surface
      // subtracted out. Measuring against gain 0 cannot work, because gain 0 is a different surface animation.
      const dx=plus.dx-minus.dx, dy=plus.dy-minus.dy, sep=Math.hypot(dx,dy);
      const fromStill=Math.hypot(plus.dx-zero.dx, plus.dy-zero.dy);
      chk(sep>10, 'reversing the field reverses where the surface goes', 'the two shifts are '+sep.toFixed(1)+' px apart in '+DT+' ms');
      chk(fromStill>3, 'and a flowing surface does not move like a still one', 'gain 1 differs from gain 0 by '+fromStill.toFixed(1)+' px');
      // NOT asserted: that each individual shift is large. The absolute shift depends on how long 150 ms of sleep really
      // was and where in the frame the two captures landed, so it swings run to run — one pass reported plus [4,1] and
      // the next [0,-1] while the SEPARATION stayed 14 and 20 px. The separation is the number with the jitter divided
      // out; asserting the parts as well would just make this red on a busy machine.
      console.log('  (absolute shifts are frame-pacing noisy and deliberately not asserted: plus '+
        JSON.stringify([plus.dx,plus.dy])+' minus '+JSON.stringify([minus.dx,minus.dy])+')');
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-river-down.png'), await page.screenshot());
      // …and a frame a human can judge: stand in the channel, look downstream.
      await page.evaluate(`__hc.tpAt(${cen.river.x+0.5}, ${cen.river.h+1.2}, ${cen.river.z+0.5})`); await sleep(1200);
      await page.evaluate(`__hc.look(${cen.river.x+0.5+cen.river.fx*14}, ${cen.river.h+0.2}, ${cen.river.z+0.5+cen.river.fz*14})`); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','flow-downstream.png'), await page.screenshot());
      chk(true, 'wrote flow-river-down.png and flow-downstream.png for judging');
    }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
