export const quote = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
// Grafana interpolates dashboard variables in its frontend. Keep time macros
// intact here so integration tests exercise the real ClickHouse plugin backend.
export function interpolate(sql, variables = {}) {
  const vars = {database: 'openpanel', project: ['$__all'], step1: 'screen_view', step2: 'signup', step3: 'revenue', currency: 'EUR', ...variables};
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(vars.database)) throw new Error('Unsafe database name');
  return sql.replace(/\$__conditionalAll\(project_id IN \(\$\{project:singlequote\}\), \$project\)/g,
    vars.project.includes('$__all') ? '1=1' : `project_id IN (${vars.project.map(quote).join(',')})`)
    .replaceAll('${database:raw}', vars.database)
    .replace(/\$\{(step1|step2|step3|currency):singlequote\}/g, (_, key) => quote(vars[key]));
}
