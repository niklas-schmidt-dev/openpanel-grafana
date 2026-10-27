const required = {
  events: {name: 'String', project_id: 'String', profile_id: 'String', session_id: 'String', created_at: 'DateTime64', origin: 'String', path: 'String', country: 'String', device: 'String', browser: 'String', properties: 'Map(String, String)', revenue: 'UInt64'},
  sessions: {project_id: 'String', created_at: 'DateTime64', sign: 'Int8', is_bounce: 'Bool', screen_view_count: 'Int32', referrer_name: 'String', utm_source: 'String', utm_medium: 'String', utm_campaign: 'String', entry_origin: 'String', entry_path: 'String'},
};
const database = process.env.CLICKHOUSE_DATABASE || 'openpanel';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) throw new Error('Database name must be an SQL identifier.');
let query;
if (process.argv.includes('--demo')) {
  const {exec} = await import('./docker.mjs');
  query = sql => exec('clickhouse', ['sh', '-c', 'exec clickhouse-client --user grafana_ro --password "$GRAFANA_CH_PASSWORD"'], sql);
} else {
  if (!process.env.CLICKHOUSE_URL || !process.env.CLICKHOUSE_USER || !process.env.CLICKHOUSE_PASSWORD) throw new Error('Set CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD; use read-only credentials.');
  const url = new URL(process.env.CLICKHOUSE_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use HTTP(S) URL and separate credential variables.');
  query = async sql => {
    const response = await fetch(url, {method: 'POST', headers: {'X-ClickHouse-User': process.env.CLICKHOUSE_USER, 'X-ClickHouse-Key': process.env.CLICKHOUSE_PASSWORD}, body: sql, signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`ClickHouse schema query failed (HTTP ${response.status}); check connection and SELECT permissions.`);
    return response.text();
  };
}
let failures = 0;
for (const [table, columns] of Object.entries(required)) {
  const rows = JSON.parse(await query(`DESCRIBE TABLE \`${database}\`.${table} FORMAT JSON`)).data;
  const found = new Map(rows.map(row => [row.name, row.type]));
  for (const [column, type] of Object.entries(columns)) {
    const actual = found.get(column) || '';
    const matches = type === 'String' ? /String/.test(actual) : actual.startsWith(type);
    if (!matches) {console.error(`${table}.${column}: expected ${type}, got ${actual || 'missing'}`); failures++;}
  }
}
if (failures) process.exitCode = 1;
else console.log('Compatible OpenPanel event/session columns. Read-only check; no data changed.');
