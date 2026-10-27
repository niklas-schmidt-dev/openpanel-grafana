import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dashboards } from '../scripts/generate.mjs';
import { interpolate } from './helpers.mjs';

test('published dashboards match their source and have portable datasource references', async () => {
  for (const dashboard of dashboards()) {
    assert.deepEqual(JSON.parse(await readFile(`dashboards/${dashboard.uid}.json`, 'utf8')), dashboard);
    const ids = new Set();
    for (const panel of dashboard.panels) {
      assert(!ids.has(panel.id)); ids.add(panel.id);
      assert.equal(panel.datasource.uid, '${DS_CLICKHOUSE}');
      assert.match(panel.targets[0].rawSql, /\$__timeFilter_ms\(created_at\)/);
      assert.match(panel.targets[0].rawSql, /\$__conditionalAll/);
    }
  }
});

test('test interpolation keeps project strings quoted and handles All', () => {
  const sql = 'SELECT * WHERE $__conditionalAll(project_id IN (${project:singlequote}), $project)';
  assert.equal(interpolate(sql, {project: ['one', "two'three"]}), "SELECT * WHERE project_id IN ('one','two\\'three')");
  assert.equal(interpolate(sql), 'SELECT * WHERE 1=1');
});
