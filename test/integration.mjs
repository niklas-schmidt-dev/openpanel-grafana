import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { exec, config } from '../scripts/docker.mjs';
import { dashboards } from '../scripts/generate.mjs';
import { interpolate } from './helpers.mjs';

const run = randomBytes(6).toString('hex');
const projectId = `opg-e2e-${run}`;
const clientId = randomUUID();
const secret = randomBytes(32).toString('hex');
const salt = randomBytes(16).toString('hex');
const hash = `${salt}.${scryptSync(secret, salt, 32).toString('hex')}`;
const fixtureDb = `opg_test_${run}`;
const clickhouse = sql => exec('clickhouse', ['sh', '-c', 'exec clickhouse-client --user opadmin --password "$CLICKHOUSE_PASSWORD" --multiquery'], sql);
const jsonQuery = sql => JSON.parse(clickhouse(`${sql} FORMAT JSON`)).data;
const requestCode = `let input=''; for await (const chunk of process.stdin) input+=chunk; const {url,body,headers,method}=JSON.parse(input); const r=await fetch(url,{method:method||'GET',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); console.log(JSON.stringify({status:r.status,text:await r.text()}));`;
const request = (url, options = {}) => JSON.parse(exec('api', ['node', '--input-type=module', '-e', requestCode], JSON.stringify({url, ...options})));
const auth = {Authorization: `Basic ${Buffer.from(`admin:${config.GRAFANA_ADMIN_PASSWORD}`).toString('base64')}`, 'Content-Type': 'application/json'};
let checks = 0;
const check = (label, condition) => {assert(condition, label); checks++; console.log(`PASS ${label}`);};
const gatewayHeaders = {Authorization:`Basic ${Buffer.from(`openpanel:${config.GATEWAY_TOKEN}`).toString('base64')}`};
check('gateway requires its own credential', request('http://gateway:8080/').status === 401);
check('gateway rejects selecting another database',request('http://gateway:8080/?database=system',{headers:gatewayHeaders}).status === 403);
const gatewayUser=request('http://gateway:8080/?query=SELECT%20currentUser()&user=opadmin&password=wrong',{headers:{...gatewayHeaders,'X-ClickHouse-User':'opadmin','X-ClickHouse-Key':'wrong'}});
check('gateway strips request-supplied database identities',gatewayUser.status === 200 && gatewayUser.text.trim() === 'openpanel_app');
const forbidden=request('http://gateway:8080/?query=SELECT%20name%20FROM%20system.users',{headers:gatewayHeaders});
check('gateway user cannot read ClickHouse accounts',forbidden.status >= 400);

// Only this checkout's freshly created demo database is modified. IDs are unique
// on each run; no production connection option is accepted by this test.
exec('postgres', ['psql', '-U', 'postgres', '-d', 'openpanel', '-v', 'ON_ERROR_STOP=1'], `
INSERT INTO organizations (id,name,"updatedAt") VALUES ('${projectId}','Integration demo',now());
INSERT INTO projects (id,name,"organizationId",domain,cors,types,"updatedAt") VALUES ('${projectId}','Integration demo','${projectId}','https://demo.example',ARRAY['https://demo.example'],ARRAY['website']::"ProjectType"[],now());
INSERT INTO clients (id,name,secret,"projectId","organizationId","updatedAt") VALUES ('${clientId}','Integration demo','${hash}','${projectId}','${projectId}',now());
`);
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const headers = {'Content-Type': 'application/json', 'openpanel-client-id': clientId, Origin: 'https://demo.example', 'User-Agent': ua};
const track = (name, properties = {}, extra = {}) => request('http://localhost:3000/track', {method: 'POST', headers: {...headers, ...extra}, body: {type: 'track', payload: {name, properties: {__path: 'https://demo.example/start?utm_source=integration&utm_campaign=launch', ...properties}}}});
const page = track('screen_view', {test_run: run});
check('OpenPanel accepts a browser pageview', page.status === 200);
const deviceId = JSON.parse(page.text).deviceId;
check('OpenPanel issues a visitor identity', typeof deviceId === 'string' && deviceId.length > 0);
const missingAuth = request('http://localhost:3000/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: {type:'track',payload:{name:'signup'}}});
check('missing client credentials rejected', missingAuth.status === 401);
check('browser revenue without a secret rejected', track('revenue', {__revenue: 1250, currency: 'EUR'}).status === 401);
check('invalid secret cannot bypass allowed browser Origin', track('revenue', {__revenue: 123, currency: 'EUR'}, {'openpanel-client-secret':'invalid-test-secret'}).status === 401);
check('invalid body secret cannot bypass allowed browser Origin', request('http://localhost:3000/track', {method:'POST',headers,body:{type:'track',clientSecret:'invalid-body-secret',payload:{name:'revenue',properties:{__revenue:123,currency:'EUR'}}}}).status === 401);
check('invalid backend secret rejected', request('http://localhost:3000/track', {method:'POST',headers:{'Content-Type':'application/json','openpanel-client-id':clientId,'openpanel-client-secret':'invalid-backend-secret'},body:{type:'track',payload:{name:'revenue',properties:{__revenue:123,currency:'EUR'}}}}).status === 401);
check('signup accepted', track('signup', {__deviceId: deviceId, test_run: run}).status === 200);
check('authenticated revenue accepted', track('revenue', {__revenue: 1250, currency: 'EUR', __deviceId: deviceId, order_id: run}, {'openpanel-client-secret': secret}).status === 200);
check('fractional minor units rejected', track('revenue', {__revenue: 1.5, currency: 'EUR'}, {'openpanel-client-secret': secret}).status === 400);
check('authenticated backend without Origin accepted', request('http://localhost:3000/track', {method:'POST',headers:{'Content-Type':'application/json','openpanel-client-id':clientId,'openpanel-client-secret':secret},body:{type:'track',payload:{name:'backend_verified',properties:{test_run:run}}}}).status === 200);
let stored = [];
for (let attempt = 0; attempt < 60; attempt++) {
  stored = jsonQuery(`SELECT name,revenue,properties['currency'] AS currency FROM openpanel.events WHERE project_id = '${projectId}'`);
  if (stored.some(row => row.name === 'revenue') && stored.some(row => row.name === 'signup')) break;
  await delay(1000);
}
check('worker persisted pageview in ClickHouse', stored.some(row => row.name === 'screen_view'));
check('worker persisted revenue and currency unchanged', stored.some(row => row.name === 'revenue' && Number(row.revenue) === 1250 && row.currency === 'EUR'));

// Adversarial query fixtures use the REAL migrated table definitions.
clickhouse(`CREATE DATABASE ${fixtureDb}; CREATE TABLE ${fixtureDb}.events AS openpanel.events; CREATE TABLE ${fixtureDb}.sessions AS openpanel.sessions; GRANT SELECT ON ${fixtureDb}.* TO grafana_ro;`);
const epoch = Date.now() - 3600000;
const date = offset => new Date(epoch + offset).toISOString().replace('T', ' ').replace('Z', '');
const rows = [
  ['a','same','screen_view',0,0,''], ['a','same','signup',1000,0,''], ['a','same','revenue',2000,1250,'EUR'],
  ['b','same','screen_view',0,0,''], ['b','same','signup',1000,0,''], ['b','same','revenue',2000,9999,'USD'],
  ['a','reverse','revenue',0,600,'EUR'], ['a','reverse','signup',1000,0,''], ['a','reverse','screen_view',2000,0,''],
  ['a','late','screen_view',0,0,''], ['a','late','signup',1000,0,''], ['a','late','revenue',1800001,900,'EUR'],
  ['a','','revenue',0,777,''],
].map(([project,session,name,offset,revenue,currency]) => ({id:randomUUID(),project_id:project,profile_id:session || 'unlinked',session_id:session,name,created_at:date(offset),origin:'https://demo.example',path:'/',country:'DE',device:'desktop',browser:'Chrome',revenue,properties:currency ? {currency} : {}}));
clickhouse(`INSERT INTO ${fixtureDb}.events FORMAT JSONEachRow\n${rows.map(row => JSON.stringify(row)).join('\n')}`);
const sessionRows = [
  {project_id:'a',id:'a-1',sign:1,version:1,is_bounce:true,screen_view_count:1},
  {project_id:'a',id:'a-1',sign:-1,version:1,is_bounce:true,screen_view_count:1},
  {project_id:'a',id:'a-1',sign:1,version:2,is_bounce:false,screen_view_count:3},
  {project_id:'b',id:'b-1',sign:1,version:1,is_bounce:true,screen_view_count:1},
].map(row => ({...row,created_at:date(0),ended_at:date(2000),entry_origin:'https://demo.example',entry_path:'/',referrer_name:'Example',utm_source:'test',utm_medium:'test',utm_campaign:'launch'}));
clickhouse(`INSERT INTO ${fixtureDb}.sessions FORMAT JSONEachRow\n${sessionRows.map(row => JSON.stringify(row)).join('\n')}`);

function grafanaQuery(sql, format = 1, variables = {}) {
  const result = request('http://grafana:3000/api/ds/query', {method:'POST',headers:auth,body:{from:String(epoch-10000),to:String(Date.now()+10000),queries:[{refId:'A',datasource:{type:'grafana-clickhouse-datasource',uid:'opg-clickhouse'},editorType:'sql',rawSql:interpolate(sql,{database:fixtureDb,...variables}),format,intervalMs:60000,maxDataPoints:1000}]}});
  const data = JSON.parse(result.text);
  assert.equal(result.status,200, JSON.stringify(data));
  assert(!data.results?.A?.error, data.results?.A?.error);
  return data.results.A.frames;
}
const values = frames => frames[0]?.data.values || [];
for (const dashboard of dashboards()) {
  const saved = request(`http://grafana:3000/api/dashboards/uid/${dashboard.uid}`, {headers:auth});
  check(`Grafana provisioned ${dashboard.uid}`, saved.status === 200);
  for (const variable of dashboard.templating.list) {
    grafanaQuery(variable.query);
    check(`variable query ${dashboard.uid}/${variable.name}`, true);
  }
  for (const panel of dashboard.panels) {
    const target = panel.targets[0];
    const all = grafanaQuery(target.rawSql,target.format);
    grafanaQuery(target.rawSql,target.format,{project:['a']});
    grafanaQuery(target.rawSql,target.format,{project:['a','b']});
    check(`Grafana SQL ${dashboard.uid}/${panel.title}: All, single, multi`, true);
    if (panel.title === 'Observed visitors') check('project IDs isolate identical visitor IDs', Number(values(all)[0][0]) === 4);
    if (panel.title === 'Sessions started') check('session corrections do not double-count', Number(values(all)[0][0]) === 2);
    if (panel.title === 'Bounce rate') check('session correction updates bounce rate', Number(values(all)[0][0]) === 50);
    if (panel.title === 'Ordered session funnel') check('funnel enforces order/window/project/session boundaries', JSON.stringify(values(all)[2].map(Number)) === '[4,3,2]');
    if (panel.title === 'Gross revenue · minor units') check('EUR never includes USD or missing currencies', Number(values(all)[0][0]) === 2750);
  }
}
// Permission must be enforced by ClickHouse, not by dashboard convention.
const denied = request('http://grafana:3000/api/ds/query', {method:'POST',headers:auth,body:{from:String(epoch),to:String(Date.now()),queries:[{refId:'A',datasource:{type:'grafana-clickhouse-datasource',uid:'opg-clickhouse'},editorType:'sql',rawSql:`INSERT INTO ${fixtureDb}.events (name) VALUES ('forbidden')`,format:1}]}});
check('Grafana database credentials reject writes', denied.status >= 400 || Boolean(JSON.parse(denied.text).results?.A?.error));
await mkdir('.local',{recursive:true});
await writeFile('.local/postman.env.json',JSON.stringify({name:'isolated OpenPanel demo',values:[{key:'baseUrl',value:'REPLACE_WITH_PORTLESS_API_URL',enabled:true},{key:'clientId',value:clientId,enabled:true}]}));
await writeFile('.local/verification.json',JSON.stringify({at:new Date().toISOString(),checks,projectId,fixtureDb,openpanel:'2.3.0 with pinned fixes',clickhouse:jsonQuery('SELECT version() AS version')[0].version,grafana:'12.3.0',plugin:'4.23.2',scope:'isolated demo; actual API → worker → ClickHouse → Grafana; adversarial SQL fixtures'},null,2)+'\n');
console.log(`${checks} checks passed. Report: .local/verification.json`);
