import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const plugin = 'grafana-clickhouse-datasource';
const ds = { type: plugin, uid: '${DS_CLICKHOUSE}' };
const db = '`${database:raw}`';
const filter = '$__timeFilter_ms(created_at) AND $__conditionalAll(project_id IN (${project:singlequote}), $project)';
const events = `${db}.events`;
const sessions = `${db}.sessions`;
const currency = "if(empty(properties['currency']), 'UNSPECIFIED', upper(properties['currency']))";
function variable(name, label, sql, current, extra = {}) {
  return {name, label, type: 'query', datasource: ds, refresh: 1, query: sql, definition: sql, current: {text: current, value: current}, options: [], ...extra};
}
function base(uid, title, description) {
  return {id: null, uid, title, description, tags: ['openpanel', 'analytics', 'opg'], timezone: 'browser', schemaVersion: 41, version: 1, editable: true,
    time: {from: 'now-7d', to: 'now'}, refresh: '1m', panels: [],
    __inputs: [{name: 'DS_CLICKHOUSE', label: 'OpenPanel ClickHouse', type: 'datasource', pluginId: plugin, pluginName: 'ClickHouse'}],
    __requires: [{type: 'grafana', id: 'grafana', name: 'Grafana', version: '12.3.0'}, {type: 'datasource', id: plugin, name: 'ClickHouse', version: '4.23.2'}],
    links: [{type: 'dashboards', tags: ['opg'], title: 'OpenPanel dashboards', asDropdown: true, includeVars: true, keepTime: true}],
    templating: {list: [
      variable('database', 'Database', "SELECT database FROM system.tables WHERE name IN ('events', 'sessions') AND match(database, '^[A-Za-z_][A-Za-z0-9_]*$') GROUP BY database HAVING countDistinct(name) = 2 ORDER BY database", 'openpanel'),
      variable('project', 'Project ID', `SELECT DISTINCT project_id FROM ${events} ORDER BY project_id`, '$__all', {multi: true, includeAll: true}),
    ]},
  };
}
function panel(d, title, sql, {type = 'table', unit = 'short', width = 12, height = 8, description = ''} = {}) {
  const previous = d.panels.at(-1);
  let x = previous ? previous.gridPos.x + previous.gridPos.w : 0;
  let y = previous?.gridPos.y || 0;
  if (x + width > 24) {x = 0; y += previous.gridPos.h;}
  d.panels.push({id: d.panels.length + 1, title, description, type, datasource: ds, gridPos: {x, y, w: width, h: height},
    targets: [{refId: 'A', datasource: ds, queryType: 'sql', editorType: 'sql', rawSql: sql, format: type === 'timeseries' ? 0 : 1}],
    fieldConfig: {defaults: {unit, decimals: unit === 'percent' ? 2 : 0, color: {mode: 'palette-classic'}, custom: type === 'timeseries' ? {drawStyle: 'line', lineWidth: 2, fillOpacity: 10, spanNulls: false} : {}}, overrides: []},
    options: type === 'stat' ? {reduceOptions: {calcs: ['lastNotNull'], values: false}, colorMode: 'value', graphMode: 'none'} : type === 'timeseries' ? {legend: {displayMode: 'list', placement: 'bottom'}, tooltip: {mode: 'multi'}} : {showHeader: true},
  });
}
export function dashboards() {
  const overview = base('opg-overview', 'OpenPanel · Overview', 'Pageviews and observed identities from events; signed session aggregates from OpenPanel 2.3.0. Project IDs are namespaced, so separate projects never share identities.');
  panel(overview, 'Pageviews', `SELECT count() AS Pageviews FROM ${events} WHERE ${filter} AND name = 'screen_view'`, {type: 'stat', width: 6, height: 4});
  panel(overview, 'Observed visitors', `SELECT uniqExactIf(tuple(project_id, profile_id), profile_id != '') AS Visitors FROM ${events} WHERE ${filter} AND name = 'screen_view'`, {type: 'stat', width: 6, height: 4, description: 'Distinct project/profile pairs with a pageview. Anonymous identities may rotate; identifying a user can change IDs. This is not a count of people across devices.'});
  panel(overview, 'Sessions started', `SELECT sum(sign) AS Sessions FROM ${sessions} WHERE ${filter}`, {type: 'stat', width: 6, height: 4});
  panel(overview, 'Bounce rate', `SELECT 100.0 * sum(toInt64(is_bounce) * sign) / nullIf(sum(sign), 0) AS BounceRate FROM ${sessions} WHERE ${filter}`, {type: 'stat', width: 6, height: 4, unit: 'percent', description: 'OpenPanel session bounce flag; live sessions can still change.'});
  panel(overview, 'Pageviews over time', `SELECT $__timeInterval_ms(created_at) AS time, count() AS Pageviews FROM ${events} WHERE ${filter} AND name = 'screen_view' GROUP BY time ORDER BY time`, {type: 'timeseries', width: 24});
  panel(overview, 'Projects', `SELECT project_id AS Project, count() AS Pageviews, uniqExactIf(profile_id, profile_id != '') AS Visitors FROM ${events} WHERE ${filter} AND name = 'screen_view' GROUP BY Project ORDER BY Pageviews DESC`);
  panel(overview, 'Pages', `SELECT origin AS Site, path AS Path, count() AS Pageviews FROM ${events} WHERE ${filter} AND name = 'screen_view' GROUP BY Site, Path ORDER BY Pageviews DESC LIMIT 50`);
  panel(overview, 'Countries', `SELECT country AS Country, count() AS Pageviews FROM ${events} WHERE ${filter} AND name = 'screen_view' GROUP BY Country ORDER BY Pageviews DESC LIMIT 30`);
  panel(overview, 'Devices', `SELECT device AS Device, browser AS Browser, count() AS Pageviews FROM ${events} WHERE ${filter} AND name = 'screen_view' GROUP BY Device, Browser ORDER BY Pageviews DESC LIMIT 30`);

  const acquisition = base('opg-acquisition', 'OpenPanel · Acquisition', 'Session-entry attribution. The date range selects session start time; sign-aware aggregates prevent double counting updates.');
  panel(acquisition, 'Session-entry sources', `SELECT if(empty(referrer_name), 'Direct / unknown', referrer_name) AS Source, sum(sign) AS Sessions, sum(screen_view_count * sign) AS Pageviews FROM ${sessions} WHERE ${filter} GROUP BY Source HAVING Sessions > 0 ORDER BY Sessions DESC`);
  panel(acquisition, 'UTM campaigns', `SELECT utm_source AS Source, utm_medium AS Medium, utm_campaign AS Campaign, sum(sign) AS Sessions FROM ${sessions} WHERE ${filter} GROUP BY Source, Medium, Campaign HAVING Sessions > 0 ORDER BY Sessions DESC`);
  panel(acquisition, 'Landing pages', `SELECT entry_origin AS Site, entry_path AS Path, sum(sign) AS Sessions, 100.0 * sum(toInt64(is_bounce) * sign) / nullIf(sum(sign), 0) AS BouncePercent FROM ${sessions} WHERE ${filter} GROUP BY Site, Path HAVING Sessions > 0 ORDER BY Sessions DESC LIMIT 50`, {width: 24});

  const funnel = base('opg-funnel', 'OpenPanel · Funnel', 'Three ordered events within 30 minutes, grouped by project and nonempty session ID. All steps must be inside the selected time range. Server events without a linked session are excluded.');
  for (const [name, label, current] of [['step1', 'Step 1', 'screen_view'], ['step2', 'Step 2', 'signup'], ['step3', 'Step 3', 'revenue']]) funnel.templating.list.push(variable(name, label, `SELECT DISTINCT name FROM ${events} WHERE $__conditionalAll(project_id IN (\${project:singlequote}), $project) ORDER BY name`, current));
  const levels = `SELECT project_id, session_id, windowFunnel(1800000, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), name = \${step1:singlequote}, name = \${step2:singlequote}, name = \${step3:singlequote}) AS level FROM ${events} WHERE ${filter} AND session_id != '' GROUP BY project_id, session_id`;
  panel(funnel, 'Ordered session funnel', `SELECT tupleElement(step, 1) AS Step, tupleElement(step, 2) AS Event, tupleElement(step, 3) AS Sessions FROM (SELECT arrayJoin([('1', \${step1:singlequote}, countIf(level >= 1)), ('2', \${step2:singlequote}, countIf(level >= 2)), ('3', \${step3:singlequote}, countIf(level >= 3))]) AS step FROM (${levels})) ORDER BY Step`, {width: 24, description: 'Strictly increasing timestamps. Simultaneous events do not establish order.'});
  panel(funnel, 'Step 1 → Step 3', `SELECT 100.0 * countIf(level >= 3) / nullIf(countIf(level >= 1), 0) AS Conversion FROM (${levels})`, {type: 'stat', width: 12, height: 5, unit: 'percent'});

  const revenue = base('opg-revenue', 'OpenPanel · Revenue', 'Gross recorded revenue, before refunds, taxes, fees or FX. OpenPanel v2 stores nonnegative integer minor units. Include a currency property with every revenue event. A backend must deduplicate payment webhooks before sending.');
  revenue.templating.list.push(variable('currency', 'Currency', `SELECT DISTINCT ${currency} AS currency FROM ${events} WHERE name = 'revenue' AND $__conditionalAll(project_id IN (\${project:singlequote}), $project) ORDER BY currency`, 'EUR'));
  const rf = `${filter} AND name = 'revenue' AND ${currency} = \${currency:singlequote}`;
  panel(revenue, 'Gross revenue · minor units', `SELECT sum(revenue) AS GrossMinorUnits FROM ${events} WHERE ${rf}`, {type: 'stat', width: 12, height: 4, description: 'EUR/USD cents; JPY yen. Kept in minor units to avoid incorrect currency-decimal assumptions.'});
  panel(revenue, 'Recorded payment events', `SELECT count() AS PaymentEvents FROM ${events} WHERE ${rf}`, {type: 'stat', width: 12, height: 4, description: 'Not guaranteed unique orders. Event IDs and order IDs are not a payment ledger.'});
  panel(revenue, 'Gross revenue over time · minor units', `SELECT $__timeInterval_ms(created_at) AS time, sum(revenue) AS GrossMinorUnits FROM ${events} WHERE ${rf} GROUP BY time ORDER BY time`, {type: 'timeseries', width: 24});
  panel(revenue, 'Revenue by project · minor units', `SELECT project_id AS Project, sum(revenue) AS GrossMinorUnits, count() AS PaymentEvents FROM ${events} WHERE ${rf} GROUP BY Project ORDER BY GrossMinorUnits DESC`);
  panel(revenue, 'Currency coverage', `SELECT ${currency} AS Currency, count() AS PaymentEvents, sum(revenue) AS GrossMinorUnits FROM ${events} WHERE ${filter} AND name = 'revenue' GROUP BY Currency ORDER BY PaymentEvents DESC`, {description: 'Amounts are grouped by currency and must not be added across rows. UNSPECIFIED needs instrumentation fixes.'});
  return [overview, acquisition, funnel, revenue];
}
export async function generate() {
  await mkdir('dashboards', {recursive: true});
  await mkdir('.local/provisioned', {recursive: true});
  for (const d of dashboards()) {
    const portable = JSON.stringify(d, null, 2) + '\n';
    await writeFile(`dashboards/${d.uid}.json`, portable);
    const provisioned = JSON.parse(portable.replaceAll('${DS_CLICKHOUSE}', 'opg-clickhouse'));
    delete provisioned.__inputs;
    await writeFile(`.local/provisioned/${d.uid}.json`, JSON.stringify(provisioned, null, 2) + '\n');
  }
  console.log('Generated four portable dashboards and demo provisioning.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generate();
