import { chromium } from 'playwright-core'; import fs from 'node:fs';
(async()=>{ const br=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const p=await br.newPage();
  for(const f of process.argv.slice(2)){
    const r=await p.evaluate(async (src)=>{
      const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; });
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
      const d=g.getImageData(0,0,c.width,c.height).data, W=c.width,H=c.height;
      const L=i=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
      let black=0,iso=0,lit=0,n=0,sum=0;
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){ const i=(y*W+x)*4,l=L(i); n++; sum+=l;
        if(l>24)lit++;
        if(l<8){ black++; if(L(i-4)>24||L(i+4)>24||L(i-W*4)>24||L(i+W*4)>24) iso++; } }
      return { mean:+(sum/n).toFixed(2), pctBlack:+(100*black/n).toFixed(3), pctIsoBlack:+(100*iso/n).toFixed(4), pctLit:+(100*lit/n).toFixed(2) };
    }, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));
    console.log(f.split(/[\/]/).pop().padEnd(12), JSON.stringify(r));
  }
  await br.close(); })();
