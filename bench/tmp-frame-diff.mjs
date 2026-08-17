// TWO SAVED FRAMES, DIFFED BY REGION — with a CONTROL region that contains none of the thing being tested.
// The props A/B read 12,736 changed pixels over the row and that number is worthless on its own: the two frames
// are separate page loads, so the sun, the cloud shadows, the sea and the canopy have all moved between them.
// A region with no props in it measures exactly that drift, and only the difference between the two regions can
// be attributed to the change. This is the same rule as the leaf harness's positive control, pointed the other
// way: prove the instrument reads a number where the answer must be ZERO.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const OUT='D:/Code/Minecraft/bench/results';
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const b64=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
(async()=>{
  const a=path.join(OUT,process.argv[2]||'props-before-world.png'), b=path.join(OUT,process.argv[3]||'props-after-world.png');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true});
  const page=await browser.newPage();
  const res=await page.evaluate(async(o)=>{
    const ld=async(src)=>{ const i=await new Promise(r=>{ const im=new Image(); im.onload=()=>r(im); im.src=src; });
      const c=document.createElement('canvas'); c.width=i.width; c.height=i.height;
      const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(i,0,0);
      return { d:g.getImageData(0,0,c.width,c.height).data, W:c.width, H:c.height }; };
    const A=await ld(o.a), B=await ld(o.b);
    const band=(x0,x1,y0,y1)=>{ let n=0,tot=0,worst=0,px=0;
      for(let y=(A.H*y0)|0;y<A.H*y1;y++)for(let x=(A.W*x0)|0;x<A.W*x1;x++){ const i=(y*A.W+x)*4;
        const dd=Math.abs(A.d[i]-B.d[i])+Math.abs(A.d[i+1]-B.d[i+1])+Math.abs(A.d[i+2]-B.d[i+2]);
        px++; tot+=dd; if(dd>24)n++; if(dd>worst)worst=dd; }
      return { changedPct:+(100*n/px).toFixed(1), meanDelta:+(tot/px).toFixed(1), worst }; };
    return {
      props:   band(0.36,0.92,0.44,0.64),   // the row of props
      control: band(0.00,0.30,0.44,0.64),   // same heights, beach and grass, no props at all
      sky:     band(0.00,0.40,0.02,0.22),   // sky and sea: pure scene drift
    };
  }, {a:b64(a), b:b64(b)});
  console.log('  props   ', JSON.stringify(res.props));
  console.log('  control ', JSON.stringify(res.control), '  <- no props in this band');
  console.log('  sky     ', JSON.stringify(res.sky));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
