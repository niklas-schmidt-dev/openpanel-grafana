import { mkdir, writeFile, access, readFile, appendFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { generate } from './generate.mjs';

await mkdir('.local', { recursive: true });
try {
  await access('.env');
  console.log('Preserving existing .env.');
} catch {
  const namespace = process.env.COMPOSE_PROJECT_NAME || `opg-${createHash('sha256').update(`${hostname()}:${process.cwd()}`).digest('hex').slice(0, 10)}`;
  if (!/^[a-z0-9][a-z0-9_-]+$/.test(namespace)) throw new Error('Invalid COMPOSE_PROJECT_NAME');
  const entries = {
    COMPOSE_PROJECT_NAME: namespace,
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT || (process.platform === 'darwin' ? 'nas-docker' : 'default'),
    ...Object.fromEntries(['POSTGRES_PASSWORD', 'CLICKHOUSE_PASSWORD', 'GRAFANA_CH_PASSWORD', 'GRAFANA_ADMIN_PASSWORD', 'COOKIE_SECRET', 'ENCRYPTION_KEY'].map(key => [key, randomBytes(32).toString('hex')])),
    API_URL: 'http://localhost/api', DASHBOARD_URL: 'http://localhost',
  };
  await writeFile('.env', Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', {mode: 0o600, flag: 'wx'});
  console.log(`Created isolated demo configuration (${namespace}); passwords saved only in .env.`);
}
for (const key of ['GATEWAY_TOKEN','OPENPANEL_CH_PASSWORD']) {
  if (!(await readFile('.env','utf8')).includes(`${key}=`)) {
    await appendFile('.env',`\n${key}=${randomBytes(32).toString('hex')}\n`);
  }
}
await generate();
