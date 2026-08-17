// Two PNGs, decoded in a real browser (no image library on this box), compared pixel by pixel.
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const [a,b]=process.argv.slice(2);
(async()=>{ const br=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const p=await br.newPage();
  const d=(f)=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
  const r=await p.evaluate(async ([A,B])=>{
    const load=(s)=>new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=s; });
    const ia=await load(A), ib=await load(B);
    const c=document.createElement('canvas'); c.width=ia.width; c.height=ia.height; const g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(ia,0,0); const pa=g.getImageData(0,0,c.width,c.height).data;
    g.clearRect(0,0,c.width,c.height); g.drawImage(ib,0,0); const pb=g.getImageData(0,0,c.width,c.height).data;
    let sum=0,max=0,n=0,diff=0;
    for(let i=0;i<pa.length;i+=4){ const dr=Math.abs(pa[i]-pb[i]),dg=Math.abs(pa[i+1]-pb[i+1]),db=Math.abs(pa[i+2]-pb[i+2]);
      const m=Math.max(dr,dg,db); sum+=(dr+dg+db)/3; if(m>max)max=m; if(m>2)diff++; n++; }
    return { w:c.width,h:c.height, meanAbs:+(sum/n).toFixed(4), max, pctOver2:+(100*diff/n).toFixed(3) };
  },[d(a),d(b)]);
  console.log(a.split(/[\/]/).pop(),'vs',b.split(/[\/]/).pop(), JSON.stringify(r));
  await br.close(); })();
