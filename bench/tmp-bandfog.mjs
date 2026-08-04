// THE WOODY BAND UNDER THE HORIZON PINES, AND WHETHER THE AIR REACHES IT. Ben: "the bottom of skybox pines are NOT affected
// by volumetric fog still" -- STILL, because the pass before this one routed only the WEATHER amount into the band's fog mix,
// and ordinary atmospheric haze (present every hour) was still choked to 0.26 of the canopy's exposure with a 0.42 ceiling.
//
// "Affected by fog" is measurable without any taste in it: the band and the canopy stand at the SAME distance, so they breathe
// the same air, and the number that says so is how far each has been mixed toward the haze. The haze itself is on screen just
// above the treeline, so the three luminances -- haze, canopy, band -- are all readable from one frame, and the band ignoring
// the fog looks like a band that stays put while the canopy climbs toward the haze.
//
// Brackets the uFogMul/uFogCap dial, since the level that still reads as WOOD rather than vanishing is Ben's eye, not mine.
//
// usage: node bench/tmp-bandfog.mjs
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
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// (mul, cap). The first pair is the OLD hard-coded behaviour, kept as the control, and it is measured AGAIN at the end of each
// sweep: the first version of this harness ran the brackets once in order and read the band jumping from luminance 27 to 101,
// which is impossible from a fog mix that only moved from 0.019 to 0.057 -- it was chunks still streaming in behind the band
// after the teleport. Returning to the control proves the dial is what moved the pixels and not the clock or the loader.
const BRACKET = [[0.26,0.42],[0.55,0.62],[0.80,0.85],[0.93,0.97],[0.26,0.42]];

// WHERE the discrepancy is visible at all. The band and the canopy both go to near-black at night (the band's own colour dims to
// 0.10 after dusk and the fog colour it fades to measures 0.0084), so a fog mix cannot show there whatever it is set to; the
// hours and the weather have to be swept to find the frame Ben is actually looking at.
const HOURS = [['dawn',0.20],['day',0.35],['dusk',0.55],['night',0.66]];

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.pinScene()');

    // The same shore view every band/join measurement has used: on the beach, looking along the coast so the far treeline and
    // the wood under it cross the middle of the frame at their signed-off angular size (uPushD 1.0, uHide 1.0 on land).
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2600);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)');
    await sleep(14000);   // QUIESCENCE. See the note on BRACKET: chunk streaming behind the treeline reads as the band changing.

    // THE SHIPPED DEFAULT, read before anything sets it — the brackets below all override the dial, so without this line the
    // harness could pass while the value the game actually boots with was left at whatever the last experiment used.
    console.log('  default dial: '+JSON.stringify(await page.evaluate('__hc.bandFog()'))+'   (mul/cap must match the canopy: 0.93/0.97)');
    const anchor=await page.evaluate('__hc.treelineAnchor()');
    console.log('  anchor: '+JSON.stringify(anchor)+'   (push/hide must be 1 or this is not the signed-off view)');

    // Find the canopy ONCE, in one frame, and reuse the row for every bracket: the geometry does not move when a fog uniform
    // changes, and re-finding the greenest row per bracket would let the row wander as the greenery washes out -- which would
    // sample a different part of the band each time and make the comparison meaningless.
    async function profile(tag){
      const f=path.join(OUT,'bandfog-'+tag+'.png');
      await page.screenshot({path:f});
      const im=decodePNG(fs.readFileSync(f));
      const x0=Math.floor(im.w*0.30), x1=Math.floor(im.w*0.62);
      const rows=[];
      for(let y=Math.floor(im.h*0.28); y<Math.floor(im.h*0.82); y++){
        let r=0,g=0,b=0,n=0; for(let x=x0;x<x1;x++){ const i=(y*im.w+x)*im.ch; r+=im.data[i]; g+=im.data[i+1]; b+=im.data[i+2]; n++; }
        rows.push({y, rgb:[r/n,g/n,b/n]});
      }
      return rows;
    }
    const lum=p=>p?(0.2126*p.rgb[0]+0.7152*p.rgb[1]+0.0722*p.rgb[2]):0;
    const CANOPY=new Map();

    // CLEAR AIR ONLY, and the clock re-pinned before every single sample. The first honest run of this harness measured the
    // weather cases too and reported the dial moving rows ABOVE the canopy by 11 luminance -- rows the band does not draw on --
    // with a noise floor of 16 against an effect of 12: the fog bank ramps, the clouds drift and at dawn and dusk the sun climbs
    // several luminance per second, so the frames were minutes apart in game time rather than identical but for one uniform.
    // Weather fog already reaches this band (that was the fix before this one) and it is measurable at 0.6 only as noise.
    for(const [hr,t] of HOURS){ const wx=0;
      const nm=hr+(wx?'-wx':'');
      await page.evaluate('__hc.setTime('+t+')');
      await page.evaluate('(()=>{ try{ return __hc.fog('+wx+'); }catch(e){ return __hc.cmdRun("/weather '+(wx?'fog '+wx:'clear')+'"); } })()');
      await sleep(wx?5000:4000);   // the weather bank ramps in and out; reading it mid-ramp reports neither state
      // canopy row, from the CURRENT bracket-independent frame (the dial is left wherever the last loop put it, so set the
      // control first and find the row in that frame -- the greenest row is most distinct when the haze is choked).
      await page.evaluate('__hc.bandFog('+BRACKET[0][0]+','+BRACKET[0][1]+')'); await sleep(600);
      const r0=await profile(nm+'-find');
      let gy=r0[0].y, gb=-1e9;
      for(const p of r0){ const green=p.rgb[1]-(p.rgb[0]+p.rgb[2])/2; if(green>gb){ gb=green; gy=p.y; } }
      // IN A FOG BANK THERE IS NO GREENEST ROW -- that is the whole point of a fog bank -- and the search then returns whatever
      // row happens to be least grey, which was 123 rows off and put every sample on the sea. The treeline does not move when the
      // weather does, so the clear-air row for this hour is the row, and it is reused rather than re-found.
      if(wx && CANOPY.has(hr)){ gy=CANOPY.get(hr); console.log('      (canopy row reused from clear air: y'+gy+'; in fog there is no greenest row to find)'); }
      else CANOPY.set(hr, gy);
      // The HAZE the band is supposed to be dissolving into: rows well ABOVE the canopy are open sky at the horizon, which is
      // the same air the fog colour is drawn from. 14 rows up clears the tallest crowns in this view.
      const haze=r0.find(p=>p.y===gy-14);
      console.log('\n  --- '+nm.toUpperCase()+' (t='+t+' wx='+wx+') --- canopy row y'+gy+' greenness '+gb.toFixed(1)
        +(haze?('   haze 14 rows above lum '+lum(haze).toFixed(1)+' rgb('+haze.rgb.map(v=>Math.round(v)).join(',')+')'):'   (no haze row)'));
      // WHICH ROWS DOES THE DIAL ACTUALLY MOVE? The first version of this harness assumed the band sat 26 rows under the canopy
      // and reported an identical rgb(109,115,87) for every bracket -- that row is the BEACH, and the band is a handful of rows
      // tall at treeline distance, not two dozen. So do not assume: photograph the control and the full-exposure end, subtract
      // them row by row, and let the rows that changed say where the band is and how far the air reaches into it.
      const shots={};
      for(const [mul,cap] of BRACKET){
        const st=await page.evaluate('__hc.bandFog('+mul+','+cap+')');
        await page.evaluate('__hc.setTime('+t+')'); await sleep(700); await page.evaluate('__hc.setTime('+t+')'); await sleep(200);
        shots[mul+'/'+cap+(shots[mul+'/'+cap]?'b':'')]={ st, rows:await profile(nm+'-'+mul) };
        await page.screenshot({ path:path.join(OUT,'bandfog-'+nm+'-'+mul+'-zoom.png'),
          clip:{ x:Math.floor(1280*0.30), y:Math.max(0,gy-30), width:520, height:120 } });
      }
      const ctl=shots['0.26/0.42'], full=shots['0.93/0.97'], back=shots['0.26/0.42b'];
      const at=(s,y)=>s.rows.find(p=>p.y===y);
      console.log('      fog on the band: control '+ctl.st.bandFog+'  full '+full.st.bandFog+'   the canopy breathes '+ctl.st.pineFog
        +'   fogCol #'+ctl.st.fogCol);
      let worst=0, wy=gy, drift=0;
      for(let y=gy-8; y<=gy+24; y++){
        const a=at(ctl,y), b=at(full,y), c=back?at(back,y):null; if(!a||!b) continue;
        const d=lum(b)-lum(a); if(Math.abs(d)>Math.abs(worst)){ worst=d; wy=y; }
        if(c) drift=Math.max(drift, Math.abs(lum(c)-lum(a)));
        if(Math.abs(d)>1.0) console.log('        y'+y+' ('+(y-gy>=0?'+':'')+(y-gy)+')  control rgb('+a.rgb.map(v=>Math.round(v)).join(',')+') lum '+lum(a).toFixed(1)
          +'   full rgb('+b.rgb.map(v=>Math.round(v)).join(',')+') lum '+lum(b).toFixed(1)+'   delta '+(d>0?'+':'')+d.toFixed(1));
      }
      console.log('      biggest move '+(worst>0?'+':'')+worst.toFixed(1)+' lum at y'+wy+' ('+(wy-gy>=0?'+':'')+(wy-gy)+' from the canopy)'
        +'   noise floor (control measured twice) '+drift.toFixed(2));

      // PROVE THE ROWS ARE THE LAYER. The magnified crop of these rows shows a beach and a coastline, and real forest is the
      // greenest thing in that frame too -- so "the greenest row" could be terrain, and every delta above could be some other
      // shader responding to something else. Hiding the horizon layer entirely says which rows it owns: the ones that move are
      // its, the ones that do not are terrain drawn in front of it.
      if(hr==='day'){
        await page.evaluate('__hc.bandFog(0.93,0.97)'); await page.evaluate('__hc.setTime('+t+')'); await sleep(800);
        const on=await profile('day-layer-on');
        await page.evaluate('__hc.horizonDbg(true,false)'); await page.evaluate('__hc.setTime('+t+')'); await sleep(800);
        const off=await profile('day-layer-off');
        await page.evaluate('__hc.horizonDbg(true,true)'); await sleep(400);
        let owned=[];
        for(let y=gy-8; y<=gy+24; y++){ const a=on.find(p=>p.y===y), b=off.find(p=>p.y===y); if(!a||!b) continue;
          if(Math.abs(lum(b)-lum(a))>2.0) owned.push((y-gy>=0?'+':'')+(y-gy)); }
        console.log('      rows the horizon layer actually owns (hidden vs shown, >2 lum): '+(owned.length?owned.join(' '):'NONE — the sampled rows are terrain, the numbers above are not the band'));
      }
    }
    console.log('\n  frames: bench/results/bandfog-<day|night>-<mul>-zoom.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
