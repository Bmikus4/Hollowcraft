// scratch verification for Ben's 08-05 spitball list: arms, lantern/torch texture, held lantern glass, monk cross.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const PAGE=process.env.HC_PAGE||'index.html';
let fails=0, checks=0;
const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
(async()=>{
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
let browser=null;
try{
const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
await page.goto(base+'/'+PAGE+'?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);

console.log('\n[1] AN ARM DOES NOT MOVE WHEN YOU EQUIP SOMETHING');
await ev('__hc.holdNone(); __hc.offNone();'); await sleep(600);
const empty=await ev('__hc.handPose()');
console.log('  empty          '+JSON.stringify(empty));
await ev('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give stone 4")'); await ev('__hc.hold("stone")'); await sleep(700);
const stone=await ev('__hc.handPose()');
console.log('  stone in hand  '+JSON.stringify(stone));
await ev('__hc.offhandSet("stone",1)'); await sleep(700);
const both=await ev('__hc.handPose()');
console.log('  stone in both  '+JSON.stringify(both));
// The fist's own y IS the reference: empty-handed that group draws buildFist. Bob rides on both, so compare within one frame.
// NEITHER FIST CHANGES HEIGHT WHEN YOU FILL IT (Ben 08-05, emphatically). The empty hand's fist and the arm that replaces it when
// an item is equipped must be at the same y, in BOTH hands, for every non-gun item — and the ITEM must keep its authored offset
// from that fist, which is the half the first attempt got wrong: it pinned the arm and left the item behind.
ok('the main fist does not move when a block is equipped', Math.abs(stone.arm[1]-empty.item[1])<0.02, {empty:empty.item[1], holding:stone.arm[1]});
ok('and the offhand fist does not either', Math.abs(both.offArm[1]-empty.item[1])<0.02, {empty:empty.item[1], holding:both.offArm[1]});
// THE ITEM RIDES WITH IT: the held block sits a fixed distance below the fist, the distance its pose was authored for (-0.30
// against an arm at -0.34, so 0.04 under the fist). If the arm moved and the item did not, this is what would catch it.
// +0.04: the item pose was authored at -0.30 against an arm at -0.34, so it sits that far ABOVE the fist, not below it.
ok('the held block keeps its authored offset from the fist', Math.abs((stone.item[1]-stone.arm[1])-0.04)<0.02,
   {fist:stone.arm[1], item:stone.item[1], gap:+(stone.item[1]-stone.arm[1]).toFixed(3)});
ok('the two arms are level with each other', Math.abs(both.arm[1]-both.offArm[1])<0.001, {main:both.arm[1], off:both.offArm[1]});
// A GUN IS THE EXEMPTION, and it is exempt by having no camera-mounted arm at all.
await ev('__hc.offNone(); __hc.cmdRun("/give ar15 1")'); await ev('__hc.hold("ar15")'); await sleep(700);
const gun=await ev('__hc.hands ? __hc.hands() : null').catch(()=>null);
console.log('  gun hands      '+JSON.stringify(gun));

console.log('\n[2] THE MONK\'S CROSS IS A CROSS');
const ip=await ev('__hc.iconPix("monk_cross")');
const icon={ tot:ip.tot, top:ip.rows[1], bar:ip.rows[8], bottom:ip.rows[14], upright:ip.cols[7], edgeL:ip.cols[1] };
console.log('  icon pixels: '+JSON.stringify(icon));
// A CIRCLE OF r=5 ABOUT (8,8) CANNOT REACH ROW 1 OR ROW 14 — that is the whole discriminator, and it needs no eye.
ok('the icon reaches the top of the tile (a circle cannot)', icon.top>0, icon.top);
ok('and the bottom of it', icon.bottom>0, icon.bottom);
ok('it has a full-height upright', icon.upright>=12, icon.upright);
ok('and a bar wider than the upright', icon.bar>=6, icon.bar);
ok('while the tile edges stay clear', icon.edgeL===0, icon.edgeL);
await ev('__hc.offNone(); __hc.cmdRun("/clearinv"); __hc.cmdRun("/give monk_cross 1")');
await ev('__hc.hold("monk_cross")'); await sleep(800);
const heldSig=await ev('__hc.heldSig()'), refSig=await ev('__hc.toolSig("monk_cross")');
console.log('  held  '+JSON.stringify(heldSig));
console.log('  ref   '+JSON.stringify(refSig));
ok('the MAIN hand is not an extruded sprite any more', heldSig.sprite===false, heldSig.sprite);
ok('and it is the same object itemModel builds for the other hand', heldSig.meshes===refSig.meshes && heldSig.tris===refSig.tris,
   {held:[heldSig.meshes,heldSig.tris], ref:[refSig.meshes,refSig.tris]});
await page.screenshot({path:path.join(OUT,'benfix-cross-hand.png')});

console.log('\n[3] THE HELD LANTERN HAS GLASS');
await ev('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give lantern 4")'); await ev('__hc.hold("lantern")'); await sleep(800);
const lant=(await ev('__hc.heldMats()')).parts;
console.log('  held lantern parts:'); for(const p of lant) console.log('    '+JSON.stringify(p));
const pane=lant.find(p=>p.transparent&&p.opacity<1);
ok('a transparent pane exists in the held lantern', !!pane, pane);
ok('and the pane is textured', !!(pane&&pane.map), pane&&pane.map);
ok('and it writes no depth, so the flame inside shows', !!(pane&&pane.depthWrite===false), pane&&pane.depthWrite);
ok('the frame is textured too', lant.some(p=>p.map&&!p.transparent), lant.filter(p=>p.map).length);
await page.screenshot({path:path.join(OUT,'benfix-lantern-hand.png')});
await ev('__hc.cmdRun("/give torch 4")'); await ev('__hc.hold("torch")'); await sleep(800);
const tor=(await ev('__hc.heldMats()')).parts;
console.log('  held torch parts:'); for(const p of tor) console.log('    '+JSON.stringify(p));
ok('every solid part of the held torch is textured', tor.filter(p=>p.t!=='ShaderMaterial').every(p=>p.map),
   tor.filter(p=>!p.map).map(p=>p.t+p.col));
await page.screenshot({path:path.join(OUT,'benfix-torch-hand.png')});

console.log('\n[4] THE PLACED ONES MATCH');
const P0=await ev('__hc.pos()');
await ev(`(()=>{ const p=__hc.pos(); const bx=Math.floor(p.x), bz=Math.floor(p.z)-3, by=Math.floor(p.y);
  for(let dx=-2;dx<=2;dx++) for(let dz=-1;dz<=1;dz++) __hc.setBlock(bx+dx,by-1,bz+dz,'stone');
  __hc.setBlock(bx-1,by,bz,'lantern'); __hc.setBlock(bx+1,by,bz,'torch'); return 1; })()`);
await sleep(1500);
await ev('__hc.cam({yaw:0,pitch:-0.12})'); await ev('__hc.holdNone()'); await sleep(900);
await page.screenshot({path:path.join(OUT,'benfix-placed.png')});
const pm=(await ev('__hc.placedMats(["ffb860","241f18","4a3520","7a6444","6a5638","87724d","6f5a3c"])')).parts;
const placed={ lantern:pm.filter(p=>['#ffb860','#241f18'].includes(p.col)), torch:pm.filter(p=>!['#ffb860','#241f18'].includes(p.col)) };
console.log('  placed lantern mats: '+JSON.stringify(placed.lantern));
console.log('  placed torch mats:   '+JSON.stringify(placed.torch));
ok('the placed lantern is textured', placed.lantern.length>0 && placed.lantern.every(p=>p.map), placed.lantern);
ok('the placed torch is textured', placed.torch.length>0 && placed.torch.every(p=>p.map), placed.torch);

console.log('\n[5] THE MONK');
const sp=await ev('__hc.monkSpawn(3,0)'); console.log('  spawned '+JSON.stringify(sp));
if(sp && sp.y!=null){
  await ev('__hc.monkPark()');
  const box=await ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
    const m=__hc.monks().live[0]; let best=null;
    for(let i=0;i<64;i++){ const yaw=i/64*Math.PI*2;
      for(const pit of [-0.08,0.0,0.08]){ __hcBR.look(yaw,pit); await f(); await f();
        const s=__hc.screenOf(m.x,m.y+1.2,m.z);
        if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),pit,off:+off.toFixed(0)}; } } }
    if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); }
    __hc.monkFace(); await f(); await f();
    const mm=__hc.monks().live[0];
    return { best, feet:__hc.screenOf(mm.x,mm.y,mm.z), head:__hc.screenOf(mm.x,mm.y+2.0,mm.z) }; })()`);
  console.log('  framed '+JSON.stringify(box.best));
  await sleep(800);
  await page.screenshot({path:path.join(OUT,'benfix-monk.png')});
  const { decodePNG }=await import('./pngprobe.mjs');
  const img=decodePNG(fs.readFileSync(path.join(OUT,'benfix-monk.png')));
  const y0=Math.max(0,Math.min(box.head.py,box.feet.py)|0), y1=Math.min(img.h-1,Math.max(box.head.py,box.feet.py)|0);
  const hw=Math.max(4,((y1-y0)*0.30)|0), cx=box.feet.px|0, x0=Math.max(0,cx-hw), x1=Math.min(img.w-1,cx+hw);
  let gold=0, blue=0, skin=0, tot=0;
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; tot++;
    if(b>r+30 && b>g+16) blue++;
    if(r>140 && g>100 && b<130 && r>b+50) gold++;
    if(r>150 && r<235 && g>120 && g<200 && b>90 && b<170 && r>b+35 && g>b+10) skin++; }
  console.log('  monk box ('+tot+'px): blue '+blue+'  gold '+gold+'  face-skin '+skin);
  ok('the crosses are still drawn on him', gold>120, gold);
  ok('and his head is drawn', skin>40, skin);
}
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
} finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
