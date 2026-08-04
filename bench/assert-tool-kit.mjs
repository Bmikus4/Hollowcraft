// #75 — EVERY HAND TOOL, ASSERTED. Four kinds x four tiers plus the two spears, checked across the
// representations that can disagree with each other.
//
// What this pins, and why each one is here rather than eyeballed:
//   1 ONE DISPATCH   — itemModel (icon/drop/peer) and setViewItem (your own hands) build the same mesh. They are
//                      separate code paths; when they drifted apart on buckshot the ground drop was right and the
//                      hand held a flat sprite, and every other number said done.
//   2 SPECULAR       — every non-wood tool has at least one Phong material. Lambert has NO specular term at all,
//                      so a Lambert tool CANNOT catch a highlight however it is lit. All four swords were Lambert;
//                      that, not the colours, was "the shiny is inconsistent".
//   3 IN-HAND SHINE  — a held iron sword's brightest pixel reaches the held iron pickaxe's. This is the only check
//                      that fails if the material is right and the geometry is too flat to catch anything.
//   4 TIER TABLE     — every tier produces a DIFFERENT set of colours. A tier missing from a colour table does not
//                      throw, it falls back to iron, so the failure looks like "diamond is a bit grey".
//   5 DAMAGE         — damage rises with tier. Diamond was absent from the tier table and took the ||0, so a
//                      diamond sword hit for 3 against a wooden sword's 4.
//   6 ICON ROUTE     — the hotbar shows the baked 3D model, not the 2D TOOLPIX sprite. Pinned because TOOLPIX is
//                      still in the file and still looks like the thing you would edit to change a tool's icon.
// usage: node bench/assert-tool-kit.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

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

const TIERS=['wood','stone','iron','diamond'], KINDS=['pickaxe','axe','shovel','sword'];
const IDS=[]; for(const t of TIERS) for(const k of KINDS) IDS.push(t+'_'+k);
IDS.push('wooden_spear','rusty_spear');

let pass=0, fail=0;
const ok  =(n,d)=>{ pass++; console.log('  PASS  '+n+(d?'   '+d:'')); };
const bad =(n,d)=>{ fail++; console.log('  FAIL  '+n+(d?'   '+d:'')); };
const chk =(c,n,d)=> c?ok(n,d):bad(n,d);

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    await sleep(1500);

    // SYNCHRONOUS per item: the main loop calls setViewItem(inv[selSlot]) every frame and __hc.hold can only reach
    // the hotbar for the first nine items, so waiting even one frame makes every later row read back the ninth tool.
    const rows={};
    for(const id of IDS) rows[id]=await page.evaluate(`(()=>{ __hc.hold(${JSON.stringify(id)});
      return { icon:__hc.iconRoute(${JSON.stringify(id)}), model:__hc.toolSig(${JSON.stringify(id)}), held:__hc.heldSig(), dmg:__hc.toolDmg(${JSON.stringify(id)}) }; })()`);

    console.log('\n--- 1  the two dispatches build the same tool ---');
    let dis=[];
    for(const id of IDS){ const m=rows[id].model, h=rows[id].held;
      if(!(m.meshes===h.meshes && m.tris===h.tris)) dis.push(id+' model '+m.meshes+'/'+m.tris+' vs held '+h.meshes+'/'+h.tris); }
    chk(dis.length===0, 'itemModel and setViewItem agree for all '+IDS.length, dis.join('; '));

    console.log('\n--- 2  every metal tool can take a specular highlight ---');
    for(const id of IDS){ const wood = id.startsWith('wood') || id==='wooden_spear';
      const phong=(rows[id].model.mats||{}).MeshPhongMaterial||0;
      if(wood) chk(true, id.padEnd(15)+' wood tier, matte by design');
      else chk(phong>0, id.padEnd(15)+' Phong parts: '+phong); }

    console.log('\n--- 4  each tier is a different tool, not iron with another name ---');
    for(const k of KINDS){ const sets=TIERS.map(t=>rows[t+'_'+k].model.cols.join(','));
      const uniq=new Set(sets); chk(uniq.size===TIERS.length, k.padEnd(15)+' 4 tiers → '+uniq.size+' distinct colour sets'); }

    console.log('\n--- 5  damage rises with tier ---');
    for(const k of KINDS){ const d=TIERS.map(t=>rows[t+'_'+k].dmg);
      const rising=d.every((v,i)=>i===0||v>d[i-1]);
      chk(rising, k.padEnd(15)+' wood→diamond '+d.join(' < ')); }

    console.log('\n--- 6  the hotbar shows the baked 3D model, not the TOOLPIX sprite ---');
    const flat=IDS.filter(id=>!rows[id].icon.threeD).concat(IDS.filter(id=>rows[id].model.sprite));
    chk(flat.length===0, 'all '+IDS.length+' icons are 3D bakes', flat.join(', '));

    console.log('\n--- 3  a held sword is as bright as a held pickaxe ---');
    // Rendered, not inspected: a material can carry specular and still show none if the geometry is a flat facet.
    // Sampled at noon with the viewmodel filling the lower-right; the metric is the brightest pixel there.
    await page.evaluate('__hc.setTime(0.30)');   // uDay is 1 at t=0 and night is 0.63..0.94 — 0.30 is broad day
    const { decodePNG }=await import('./pngprobe.mjs');
    const CLIP={x:470,y:300,width:430,height:300};
    const shot=async(name)=>{ await sleep(450); const buf=await page.screenshot({ clip:CLIP });
      if(name) fs.writeFileSync(path.join(ROOT,'bench','results','toolkit-'+name+'.png'), buf); return decodePNG(buf); };
    const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
    // decodePNG returns {w,h,ch,data} and ch is 3 for an opaque screenshot — stepping by a hard 4 walks the
    // channels out of phase and every luma after the first pixel is a mix of three different pixels.
    const step=img=>img.ch;
    // ONLY THE TOOL'S OWN PIXELS. A plain max over the crop reads the SKY and returns the same number for every
    // tool — that check passed 214.8 for a pickaxe, an iron sword and a diamond sword before this diff was added.
    await page.evaluate('__hc.holdNone()'); const empty=await shot();
    const peak=async id=>{ await page.evaluate(`__hc.hold(${JSON.stringify(id)})`); const img=await shot(id);
      let mx=0, n=0;
      for(let i=0;i<img.data.length;i+=step(img)){ const a=lum(img.data,i), b=lum(empty.data,i);
        if(Math.abs(a-b)<12) continue;                                   // unchanged = world, not the viewmodel
        n++; if(a>mx)mx=a; }
      await page.evaluate('__hc.holdNone()'); await sleep(120);
      return { peak:+mx.toFixed(1), px:n }; };
    const pk={}; for(const id of ['iron_pickaxe','iron_sword','diamond_sword']) pk[id]=await peak(id);
    const enough=Object.values(pk).every(v=>v.px>2000);
    chk(enough, 'the viewmodel is actually in frame', Object.keys(pk).map(k=>k+' '+pk[k].px+'px').join(', '));
    if(enough){ chk(pk.iron_sword.peak >= pk.iron_pickaxe.peak*0.85, 'iron sword within 15% of iron pickaxe peak', 'sword '+pk.iron_sword.peak+' vs pickaxe '+pk.iron_pickaxe.peak);
                chk(pk.diamond_sword.peak >= pk.iron_sword.peak*0.95, 'diamond sword at least as bright as iron', 'diamond '+pk.diamond_sword.peak+' vs iron '+pk.iron_sword.peak); }

    console.log('\n--- 7  the diamond blade goes dark at night ---');
    // Emissive respects NONE of the three fog systems, and a greatsword blade is roughly thirty times the area of
    // a pickaxe head — the same emissive that reads as a glint on a pickaxe reads as a lamp on a sword. This asserts
    // the blade is lit, not self-lit. setTime: uDay is 1 at t=0; night runs 0.63..0.94 and is darkest at 0.63.
    const meanOf=async(id,t)=>{ await page.evaluate('__hc.setTime('+t+')'); await page.evaluate('__hc.holdNone()'); const e=await shot();
      await page.evaluate(`__hc.hold(${JSON.stringify(id)})`); const img=await shot(id+(t>0.5?'-night':'-noon'));
      // A LOWER threshold than the daylight check on purpose: at midnight the whole frame sits near luma 30, so a
      // difference of 12 between held and empty is most of the available range and the mask comes back empty.
      let s=0,n=0; for(let i=0;i<img.data.length;i+=step(img)){ const a=lum(img.data,i), b=lum(e.data,i);
        if(Math.abs(a-b)<4) continue; s+=a; n++; }
      return n>500?+(s/n).toFixed(1):null; };
    // Measured against the IRON sword rather than a constant: how far any blade darkens between noon and midnight
    // is a property of the whole lighting stack, so the only honest question is whether the diamond one darkens
    // LIKE IT DOES. A fixed threshold here would have to be re-tuned every time the sky changes.
    const dNoon=await meanOf('diamond_sword',0.30), dNight=await meanOf('diamond_sword',0.63);
    const iNoon=await meanOf('iron_sword',0.30),    iNight=await meanOf('iron_sword',0.63);
    const dR=dNight/dNoon, iR=iNight/iNoon;
    chk(dR <= iR*1.35, 'diamond blade darkens like iron does', 'diamond '+dNoon+'→'+dNight+' ('+dR.toFixed(2)+'x), iron '+iNoon+'→'+iNight+' ('+iR.toFixed(2)+'x)');

    console.log('\n--- 8  you can see your own spear ---');
    // A spear is built at its true 6.7 blocks, which is right everywhere except your own hands: at 1:1 the shaft
    // ran through the camera — measured, four of the eight corners of its bounding box projected BEHIND the near
    // plane — and the old 0.98 rad carry angle put what was left above the top of the frame. Every flag said drawn.
    // So the check is geometric, not a flag: nothing behind the eye, and a real share of the screen covered.
    for(const id of ['wooden_spear','rusty_spear','iron_pickaxe']){
      await page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(200);
      const b=await page.evaluate('__hc.viewBounds()');
      chk(b.cornersBehind==='0/8' && b.onScreen>0.05, id.padEnd(15)+' in front of the eye and on screen',
        'behind '+b.cornersBehind+', covers '+b.onScreen); }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
