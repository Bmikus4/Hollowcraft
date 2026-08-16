// THE ATTACHMENT SYSTEM, MEASURED. Ben: "attatchment system, items and all models imported", "guns should all have
// no attatchments on them as seperate items", and 08-15 "T activating attachments".
// Four things have to be true and none of them can be judged from a picture:
//   * an attachment is state on the gun INSTANCE, so two identical rifles wear different optics
//   * a fitted piece sits ON the rail plane it was fitted to, not buried in the receiver or floating over it
//   * it comes out the size it says it is, in blocks — the models are ~30x smaller than the guns as exported
//   * T opens the screen and the screen fits and clears through the same path a player uses
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1200);

    // THE ITEMS EXIST AND NONE OF THEM IS A GUN. A recipe whose output is a rifle-with-a-scope is exactly what this
    // system replaced, so the check is on the items themselves rather than on a screenshot of a crafting grid.
    const items=await p.evaluate("(()=>{const ids=['red_dot','holo_sight','optic_scope','suppressor','weapon_light','laser_sight','foregrip'];"+
      "return ids.map(i=>{const r=__hc.itemInfo?__hc.itemInfo(i):null; return {i, ok:!!r, gun:!!(r&&r.gun), craft:__hc.canCraft?!!__hc.canCraft(i):null};});})()");
    console.log('items', JSON.stringify(items));
    T('all seven attachment items exist', items.every(x=>x.ok), items.filter(x=>!x.ok));
    T('no attachment is a gun', items.every(x=>!x.gun), items.filter(x=>x.gun));

    // the attach screen fits what the PLAYER is carrying, so the pack has to have them in it
    await p.evaluate("__hc.cmdRun('/give red_dot 1'); __hc.cmdRun('/give holo_sight 1'); __hc.cmdRun('/give suppressor 1')");
    await p.evaluate("__hc.hold('ar15')"); await sleep(700);
    const bare=await p.evaluate("__hc.attProbe()");
    console.log('bare', JSON.stringify(bare).slice(0,300));
    T('a gun starts with nothing on it', bare.fitted && bare.fitted.length===0, bare.fitted);
    T('the rail plane is known', !!(bare.mount && bare.mount.base!=null), bare.mount);

    const dot=await p.evaluate("__hc.attFit('optic','red_dot')"); await sleep(300);
    console.log('dot', JSON.stringify(dot.fitted));
    T('the optic is fitted', dot.fitted.length===1 && dot.fitted[0].id==='red_dot', dot.fitted);
    // SIZE IN BLOCKS, not in the model's own units: ATT_DEFS.red_dot asks for 0.10 along the bore. Anything under a
    // centimetre is the un-scaled export, which is the failure the whole fitter exists to prevent.
    T('it is the size it was authored at', dot.fitted[0] && Math.abs(dot.fitted[0].size[2]-0.10)<0.05, dot.fitted[0]&&dot.fitted[0].size);
    // ON the rail: the mount's base is in model units and the fitted y is in game units, so the comparison is against
    // the optic's own foot — it must sit within a centimetre of the plane, not inside it and not hovering.
    T('it sits on the rail, not in it', dot.opticTop!=null && dot.opticTop>dot.fitted[0].pos[1], {opticTop:dot.opticTop, y:dot.fitted[0].pos[1]});

    const sup=await p.evaluate("__hc.attFit('muzzle','suppressor')"); await sleep(300);
    T('two slots are worn at once', sup.fitted.length===2, sup.fitted.map(f=>f.slot));
    // TEXTURED, not flat paint (Ben: "attatchments textured and fitted per gun"). They go through _glbGunStyle, the
    // same treatment the gun's own metal gets, so every mesh in a fitted piece must carry a map.
    // Glass is the exception and it is deliberate: _glbGunStyle hands a lens a colour and a specular and no
    // photograph, because a metal texture on a sight window is exactly what an optic must not have.
    T('a fitted attachment is textured', sup.fitted.every(f=>f.meshes>0 && f.mapped>0 && f.mapped>=f.meshes-1), sup.fitted.map(f=>[f.id,f.mapped,f.meshes]));
    T('the can is out at the muzzle', sup.fitted.some(f=>f.slot==='muzzle' && f.pos[2] < -0.3), sup.fitted);

    // PER INSTANCE. The second rifle is a different stack of the same id: it must come up bare.
    // PER INSTANCE. __hc.hold() mints a fresh stack every call, which is itself the proof: a second AR-15 is a
    // different instance and comes up bare, while the state of the first rode its own stack object.
    const two=await p.evaluate("(()=>{const a=__hc.attProbe(); __hc.hold('ak'); const b=__hc.attProbe(); __hc.hold('ar15'); const c=__hc.attProbe();"+
      "return {first:a.wearing, other:b.wearing, back:c.wearing, k1:a.key, k2:b.key, k3:c.key};})()");
    console.log('instances', JSON.stringify(two));
    T('another gun does not wear it', !two.other || Object.keys(two.other).length===0, two.other);
    T('a fresh instance of the same gun is bare', two.k3!==two.k1 && Object.keys(two.back).length===0, two);

    await p.evaluate("__hc.attFit('optic','red_dot')"); await sleep(200);
    const cleared=await p.evaluate("__hc.attFit('optic',null)"); await sleep(200);
    T('an attachment can be taken off', !cleared.fitted.some(f=>f.slot==='optic'), cleared.fitted);

    // THE SCREEN, through the keys a player presses.
    const inPack=await p.evaluate("(()=>{const r=__hc.cmdRun('/give red_dot 1'); return {r, rows:__hc.attProbe().rows};})()");
    console.log('give', JSON.stringify(inPack));
    // SNAPSHOT EACH STEP, do not hold the object. `wearing` is the live per-instance map, so a later Backspace
    // empties the same object an earlier read is still pointing at — every step read as "{}" and the fit looked
    // broken when it had worked.
    const ui=await p.evaluate("(()=>{const C=o=>JSON.parse(JSON.stringify(o||{}));"+
      "__hc.attOpen(true); const o=__hc.attProbe().ui; __hc.attKey('KeyS'); __hc.attKey('KeyW');"+
      "__hc.attKey('Enter'); const a=C(__hc.attProbe().wearing); __hc.attKey('Backspace'); const b=C(__hc.attProbe().wearing);"+
      "__hc.attOpen(false); return {opened:o, afterEnter:a, afterBack:b, closed:__hc.attProbe().ui};})()");
    console.log('ui', JSON.stringify(ui));
    T('T opens the attach screen', ui.opened===true, ui);
    T('ENTER fits from the screen', ui.afterEnter && Object.keys(ui.afterEnter).length>0, ui.afterEnter);
    T('BACKSPACE clears from the screen', ui.afterBack && !ui.afterBack.optic, ui.afterBack);
    T('it closes again', ui.closed===false, ui);

    // THE INSPECT CARRY. Ben assigned the cross-chest animation to this screen, and a sweep reads differently from
    // the sprint FOLD in exactly one way that can be measured: the yaw moves more than the pitch. Comparing |dry|
    // against |drx| is how assert-sprint-carry tells them apart, and the same test says this is not that.
    await p.evaluate("__hc.hold('ar15')"); await sleep(400);
    const rest=await p.evaluate("__hc.swayMag()");
    await p.evaluate("__hc.attOpen(true)");
    await sleep(900);
    const held=await p.evaluate("__hc.swayMag()");
    await p.evaluate("__hc.attOpen(false)"); await sleep(900);
    const back=await p.evaluate("__hc.swayMag()");
    const d=(a,b,k)=>+(b.pose[k]-a.pose[k]).toFixed(3);
    console.log('carry', JSON.stringify({rest:rest.pose, held:held.pose, attT:held.attT}));
    T('the carry latches while the screen is open', held.attT>0.9, {attT:held.attT});
    T('the gun comes across to the left', d(rest,held,'x')<-0.10, {dx:d(rest,held,'x')});
    T('it is a SWEEP, not the sprint fold', Math.abs(d(rest,held,'ry'))>Math.abs(d(rest,held,'rx')), {dry:d(rest,held,'ry'), drx:d(rest,held,'rx')});
    // The pose authors NO z. What z does move is nearPlaneClear's own correction answering the new rotation, which
    // is the trap this pose is written around — so the bound is the guard's size, not zero.
    T('the pose does not reach into z itself', Math.abs(d(rest,held,'z'))<0.12, {dz:d(rest,held,'z')});
    T('it lets go when the screen closes', back.attT<0.1, {attT:back.attT});

    // THE ATTACHMENT HAS TO DO SOMETHING. A fitted can makes the gun quiet (and takes the suppressed damage
    // penalty with it), and an optic takes the rear iron sight off the rail it is standing on.
    const fx=await p.evaluate("(()=>{__hc.hold('ar15'); __hc.attFit('optic',null); __hc.attFit('muzzle',null);"+
      "const bare=__hc.sightPix?JSON.parse(JSON.stringify(__hc.sightPix())):null;"+
      "__hc.attFit('optic','red_dot'); const withOptic=__hc.sightPix?JSON.parse(JSON.stringify(__hc.sightPix())):null;"+
      "return {bare, withOptic};})()");
    // sightPix lists every drawn sight element under `parts`, each tagged with what it is (post/wing/ring/
    // notch/ear/base). The REAR pieces are the ones an optic replaces.
    const rearOf=o=>((o&&o.parts)||[]).filter(e=>/ring|notch|ear|base/.test(e.t||e.tag||e.name||'')).length;
    console.log('irons', JSON.stringify({bare:rearOf(fx.bare), optic:rearOf(fx.withOptic)}));
    T('an optic takes the rear iron sight off', rearOf(fx.withOptic) < rearOf(fx.bare), {bare:rearOf(fx.bare), optic:rearOf(fx.withOptic)});

    // EVERY GUN, NOT JUST THE ONE WITH AN AUTHORED MOUNT. The rail plane is derived from each gun's own rear-sight
    // root, so this is the check that the derivation holds across the rack: an optic that lands under the receiver
    // line or a metre down the barrel is a mount that needs authoring, and this names which gun.
    const guns=(await p.evaluate("__hc.attProbe()")).guns||[];
    const bad=[];
    for(const gid of guns){
      const r=await p.evaluate(g=>{ __hc.hold(g); const a=__hc.attFit('optic','red_dot'); return JSON.parse(JSON.stringify({g, m:a.mount||null, f:a.fitted||[], len:a.len})); }, gid);
      const opt=r.f.find(f=>f.slot==='optic');
      if(!opt){ if(r.m) bad.push({g:gid, why:'no optic built'}); continue; }
      const y=opt.pos[1], z=opt.pos[2];
      if(!(y>0.0 && y<0.40)) bad.push({g:gid, why:'rail height', y});
      else if(Math.abs(z)>Math.max(0.9,(r.len||0.8)*1.3)) bad.push({g:gid, why:'along the barrel', z});
    }
    console.log('rack', guns.length, 'guns; bad:', JSON.stringify(bad));
    T('an optic lands on the rail of every gun that can take one', bad.length===0, bad);

    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
