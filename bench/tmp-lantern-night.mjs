// "the only hangup I have for night time right now is the way that lanterns look" (Ben 08-05, after signing off the
// night). A lantern is three things: a dark iron cage (lanternMetalMat, plain Phong, no emissive), a translucent amber
// pane (lanternPaneMat, opacity 0.34, emissive 0x3a1e06) and a flame quad inside the box. The pool PointLight sits AT
// the lantern, so the cage's outward faces point away from it and receive almost nothing — and since the night descent
// (d1edd46) everything unlit descends toward black.
// THE TEST IS WHETHER A LAMP IS THE BRIGHTEST THING IN ITS OWN FRAME. Place a lantern on open ground at midnight, put
// the camera on it, and compare the luma of the lamp itself against the pool of light it throws on the ground. A lamp
// darker than the floor it lights is the fault, whatever else is going on.
// node bench/tmp-lantern-night.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function stats(file,x0,y0,w,h){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0,mx=0,hot=0,sat=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const i=(y*P.w+x)*ch;
    const r=P.data[i],g=P.data[i+1],b=P.data[i+2], L=(r+g+b)/3;
    s+=L; n++; if(L>mx)mx=L; if(L>128)hot++;
    // CHROMA, because "lights burst colour in the night" is half of what the wash is for: max-min over max is 0 for grey.
    const M=Math.max(r,g,b), m2=Math.min(r,g,b); sat += M? (M-m2)/M : 0; }
  return { mean:+(s/n).toFixed(2), max:+mx.toFixed(1), hotShare:+(hot/n).toFixed(3), chroma:+(sat/n).toFixed(3) };
}

let T=0.75;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const FILE='index.html';
    console.log('page ' + FILE);
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+FILE+'?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime('+T+')');   // MIDNIGHT — 0 is sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
    await sleep(3000);
    const at=await page.evaluate(`(()=>{ const P=__hc.probe(); const r=__hc.place2(P.x+6, P.z+6, 'lantern', 0); return r; })()`);
    console.log('lantern at ' + JSON.stringify(at));
    if(at.err) throw new Error(at.err);
    await sleep(2500);
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const shoot=async(tag,dist,dy)=>{
      await page.evaluate('__hc.tpAt('+(at.bx+dist)+','+(at.by+dy)+','+(at.bz+dist)+')');
      await sleep(1800); await page.evaluate('__hc.setTime('+T+')');
      // WHERE THE CAMERA ACTUALLY IS. The first run of this harness shot the empty sky: tpAt does not necessarily leave
      // the player where it was asked to, and a frame of stars measures nothing.
      const where=await page.evaluate('(()=>{const p=__hc.probe(); return {x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1), blockAtLantern:__hc.blockAt('+at.bx+','+at.by+','+at.bz+')};})()');
      console.log('    camera ' + JSON.stringify(where) + '  lantern id ' + (await page.evaluate('__hc.bid("lantern")')));
      // AIM TWICE. look() computes pitch from camera.position, and tpAt does not snap to the ground — the player was
      // still FALLING when the first aim was taken, so the eye dropped a block afterwards and pushed the lamp to the top
      // of the frame. The second aim is taken once everything has landed.
      await page.evaluate('__hc.look('+(at.bx+0.5)+','+(at.by+0.3)+','+(at.bz+0.5)+')');
      await sleep(1200);
      const aim=await page.evaluate('__hc.look('+(at.bx+0.5)+','+(at.by+0.3)+','+(at.bz+0.5)+')');
      console.log('    aim ' + JSON.stringify(aim));
      await page.evaluate('__hc.setTime('+T+')'); await sleep(400);
      const f=path.join(ROOT,'bench','results','lantern-night-'+tag+'.png');
      await page.screenshot({path:f});
      return f;
    };
    // 2.5 blocks back and slightly above: the lamp lands in the middle of the frame and its pool of light around it.
    const f=await shoot('near',2,1);
    // IS THE LAMP DARK, OR IS IT NOT DRAWN? The same frame at noon settles it: a model that is invisible at both hours
    // is a missing draw call, and a model visible by day and gone at night is a lighting fault.
    T=0.25; const fd=await shoot('day',2,1);
    console.log('  BY DAY   lamp ' + JSON.stringify(stats(fd,370,200,60,60)) + '  ground ' + JSON.stringify(stats(fd,250,290,300,90)));
    T=0.75;
    // the aim puts the lamp dead centre of an 800x450 frame
    const lamp = stats(f, 370,200, 60,60);      // the lantern itself
    const pool = stats(f, 250,290, 300,90);     // the ground it lights, just below
    const far  = stats(f, 0,330, 160,100);      // night ground away from the lamp
    console.log('  the lamp itself   ' + JSON.stringify(lamp));
    console.log('  the pool of light ' + JSON.stringify(pool));
    console.log('  night, off-lamp   ' + JSON.stringify(far));
    // IS IT THE WASH? The lamp is absent from the night frame and present in the day frame at the same camera, and the
    // scotopic wash is the only thing between them that keys on delivered light. Turning the whole wash off is the
    // decisive test: if the lamp comes back, the wash is crushing it (and the pane's own opt-out did not take).
    await page.evaluate('__hc.scot({on:false})'); await sleep(600);
    const fNoWash=await shoot('nowash',2,1);
    console.log('  WASH OFF lamp ' + JSON.stringify(stats(fNoWash,370,200,60,60)) + '  ground ' + JSON.stringify(stats(fNoWash,250,290,300,90)));
    await page.evaluate('__hc.scot({on:true})'); await sleep(600);
    // …and the prop fill, the other night-time term on a non-atlas material.
    await page.evaluate('__hc.propFill({on:false})'); await sleep(600);
    const fNoFill=await shoot('nofill',2,1);
    console.log('  FILL OFF lamp ' + JSON.stringify(stats(fNoFill,370,200,60,60)));
    await page.evaluate('__hc.propFill({})');
    console.log('  VERDICT: a lamp should be the brightest thing in its own frame — lamp mean ' + lamp.mean +
                ' vs pool mean ' + pool.mean + ', lamp max ' + lamp.max + ' vs pool max ' + pool.max);
    console.log('  frame bench/results/lantern-night-near.png');
  } finally { await browser.close(); server.kill(); }
})();
