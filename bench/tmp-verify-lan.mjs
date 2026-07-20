// LAN/VPN DISCOVERY + RELAY VERIFIER — simulates two machines on one broadcast domain (what
// Radmin VPN / Hamachi provide): host A advertises via UDP beacon, machine B's server hears it
// and lists it on /lan with A's IP; a WebSocket client then joins A and messages relay.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (url) => new Promise((res,rej)=>{ http.get(url, r=>{ let b=''; r.on('data',d=>b+=d); r.on('end',()=>res(b)); }).on('error',rej); });

(async () => {
  const A = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:'9401', MP_DISC:'9409'}, stdio:'ignore' });
  const B = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:'9402', MP_DISC:'9409'}, stdio:'ignore' });
  const fails=[]; const ck=(n,c,i)=>{ if(!c) fails.push(n+' :: '+JSON.stringify(i)); };
  try {
    await sleep(1200);
    await get('http://127.0.0.1:9401/advertise?on=1&name=RadminTest');   // A clicks Host
    await sleep(4800);                                                    // two beacon intervals
    const lanB = JSON.parse(await get('http://127.0.0.1:9402/lan'));      // B's menu polls its OWN server
    const found = lanB.find(h=>h.name==='RadminTest');
    ck('machine B discovered host A via UDP beacon', !!found, lanB);
    ck('discovered entry carries A ip+port to join', found && found.gport===9401 && !!found.ip, found);

    // raw WebSocket join to A + relay check (two sockets, message from one reaches the other)
    const wsConnect = (port) => new Promise((res,rej)=>{ const key=crypto.randomBytes(16).toString('base64');
      const sock=net.connect(port,'127.0.0.1',()=>{ sock.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n'); });
      let up=false, buf=Buffer.alloc(0); const msgs=[];
      sock.on('data',d=>{ if(!up){ const s=d.toString(); if(s.includes('101')){ up=true; res({sock,msgs}); } return; }
        buf=Buffer.concat([buf,d]);
        while(buf.length>=2){ let len=buf[1]&0x7f, off=2; if(len===126){ if(buf.length<4)break; len=buf.readUInt16BE(2); off=4; }
          if(buf.length<off+len)break; msgs.push(JSON.parse(buf.slice(off,off+len).toString())); buf=buf.slice(off+len); } });
      sock.on('error',rej); setTimeout(()=>rej(new Error('ws timeout')),5000); });
    const send = (sock,obj) => { const b=Buffer.from(JSON.stringify(obj)); const mask=crypto.randomBytes(4);
      const head=b.length<126?Buffer.from([0x81,0x80|b.length]):(()=>{const h=Buffer.alloc(4);h[0]=0x81;h[1]=0x80|126;h.writeUInt16BE(b.length,2);return h;})();
      const m=Buffer.alloc(b.length); for(let i=0;i<b.length;i++)m[i]=b[i]^mask[i&3]; sock.write(Buffer.concat([head,mask,m])); };
    const c1 = await wsConnect(9401); await sleep(300);
    const c2 = await wsConnect(9401); await sleep(300);
    ck('host designation: first client is host', c1.msgs.some(m=>m.t==='welcome'&&m.host===true), c1.msgs);
    ck('second client sees a peer', c2.msgs.some(m=>m.t==='welcome'&&m.peers&&m.peers.length===1), c2.msgs);
    send(c2.sock,{t:'p',x:1,y:2,z:3,yaw:0});
    await sleep(400);
    ck('relay: c2 position reached c1', c1.msgs.some(m=>m.t==='p'&&m.x===1), c1.msgs.filter(m=>m.t==='p'));
    c1.sock.destroy(); c2.sock.destroy();
    console.log(JSON.stringify({ pass:fails.length===0, fails }, null, 1));
    process.exit(fails.length?1:0);
  } finally { try{A.kill();}catch(e){} try{B.kill();}catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
