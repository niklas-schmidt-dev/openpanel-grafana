import http from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const {CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD, GATEWAY_TOKEN} = process.env;
const database = process.env.CLICKHOUSE_DATABASE || 'openpanel';
if (!CLICKHOUSE_URL || !CLICKHOUSE_USER || !CLICKHOUSE_PASSWORD || !GATEWAY_TOKEN || GATEWAY_TOKEN.length < 32) throw new Error('Missing gateway credentials (token must be at least 32 characters)');
const upstream = new URL(CLICKHOUSE_URL);
if (!['http:','https:'].includes(upstream.protocol) || upstream.username || upstream.password) throw new Error('Use a plain HTTP(S) upstream URL and separate credentials');
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) throw new Error('Invalid database identifier');
const expected = createHash('sha256').update(`Basic ${Buffer.from(`openpanel:${GATEWAY_TOKEN}`).toString('base64')}`).digest();
const maxBytes = 16 * 1024 * 1024;
let active = 0;
function fail(response, code, message) {response.writeHead(code, {'Content-Type':'text/plain','Cache-Control':'no-store'});response.end(message);}

const server = http.createServer(async (request,response) => {
  if (request.method === 'GET' && request.url === '/healthz') return fail(response,200,'ok');
  const supplied=createHash('sha256').update(request.headers.authorization || '').digest();
  if (!timingSafeEqual(expected,supplied)) return fail(response,401,'Unauthorized');
  if (!['GET','POST'].includes(request.method) || request.url.length > 8192) return fail(response,400,'Unsupported request');
  let incoming;
  try {incoming = new URL(request.url, 'http://gateway');}
  catch {return fail(response,400,'Invalid URL');}
  if (!['/','/ping'].includes(incoming.pathname)) return fail(response,404,'Not found');
  if (incoming.searchParams.has('database') && incoming.searchParams.get('database') !== database) return fail(response,403,'Database not permitted');
  if (active >= 8) return fail(response,429,'Too many concurrent requests');
  if (Number(request.headers['content-length']) > maxBytes) return fail(response,413,'Request too large');
  active++;
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),310000);
  const onClose=()=>{if(!response.writableEnded)controller.abort();};
  response.on('close',onClose);
  try {
    const chunks=[];let size=0;
    for await (const chunk of request) {
      size+=chunk.length;
      if (size>maxBytes) {fail(response,413,'Request too large');return;}
      chunks.push(chunk);
    }
    const destination=new URL(upstream);
    destination.pathname=incoming.pathname;
    destination.search=incoming.search;
    // No request-supplied identity reaches ClickHouse. SQL authorization is
    // enforced by the fixed upstream user, restricted to the OpenPanel database.
    for (const key of ['user','password','quota_key','roles','role']) destination.searchParams.delete(key);
    destination.searchParams.set('database',database);
    const headers={'X-ClickHouse-User':CLICKHOUSE_USER,'X-ClickHouse-Key':CLICKHOUSE_PASSWORD};
    for (const key of ['content-type','content-encoding']) if(request.headers[key]) headers[key]=request.headers[key];
    // Do not advertise compressed responses: fetch decodes HTTP compression.
    const result=await fetch(destination,{method:request.method,headers,body:request.method==='POST'?Buffer.concat(chunks):undefined,signal:controller.signal,redirect:'error'});
    response.writeHead(result.status,{'Content-Type':result.headers.get('content-type') || 'text/plain','Cache-Control':'no-store'});
    if (result.body) {
      await pipeline(Readable.fromWeb(result.body),response,{signal:controller.signal});
    }
    response.end();
  } catch {
    if (!response.headersSent) fail(response,controller.signal.aborted?504:502,'ClickHouse upstream unavailable');
    else response.destroy();
  } finally {
    clearTimeout(timer);response.off('close',onClose);active--;
  }
});
server.requestTimeout=120000;
server.headersTimeout=10000;
server.listen(Number(process.env.PORT || 8080),process.env.HOST || '::',()=>console.log('OpenPanel database gateway listening'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
