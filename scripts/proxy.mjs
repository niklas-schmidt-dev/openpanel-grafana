import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { compose, context } from './docker.mjs';

if (!process.env.PORT) throw new Error('Start through portless run; PORT must be assigned.');
const service = process.env.OPG_SERVICE || 'grafana';
if (!['grafana','api','dashboard'].includes(service)) throw new Error('Unknown OPG_SERVICE');
const binding = compose(['port',service,'3000']).trim();
const remotePort = Number(binding.split(':').at(-1));
const info = spawnSync('docker',['--context',context,'context','inspect',context],{encoding:'utf8'});
if (info.status !== 0) throw new Error('Cannot inspect Docker context.');
const endpoint = JSON.parse(info.stdout)[0].Endpoints.docker.Host;
let targetPort = remotePort;
let tunnel;
if (endpoint.startsWith('ssh://')) {
  const address = new URL(endpoint);
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0,'127.0.0.1',resolve));
  targetPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  tunnel = spawn('ssh',['-N','-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-L',`127.0.0.1:${targetPort}:127.0.0.1:${remotePort}`,...(address.port?['-p',address.port]:[]),`${address.username ? `${address.username}@` : ''}${address.hostname}`],{stdio:['ignore','ignore','inherit']});
} else if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
  throw new Error('Use a local or SSH Docker context; remote TCP context needs an explicit private tunnel.');
}
let ready = false;
for (let attempt=0;attempt<50;attempt++) {
  ready = await new Promise(resolve => {
    const socket=net.connect(targetPort,'127.0.0.1');
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',()=>resolve(false));
  });
  if (ready) break;
  if (tunnel?.exitCode !== null && tunnel?.exitCode !== undefined) throw new Error('SSH tunnel exited.');
  await delay(100);
}
if (!ready) {tunnel?.kill();throw new Error('Demo endpoint unavailable.');}
const server = http.createServer((req,res)=>{
  const upstream=http.request({host:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers:req.headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502);res.end('Demo upstream unavailable');});
  req.pipe(upstream);
});
server.listen(Number(process.env.PORT),process.env.HOST || '127.0.0.1',()=>console.log(`${service} via ${process.env.PORTLESS_URL || `assigned port ${process.env.PORT}`}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{tunnel?.kill();server.close(()=>process.exit(0));});
