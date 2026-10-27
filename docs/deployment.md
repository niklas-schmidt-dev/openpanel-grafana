# Existing ClickHouse and Railway

OpenPanel needs **PostgreSQL and Redis as well as ClickHouse**. Its API, worker
and dashboard are separate processes. It cannot be replaced by a tracking script
that inserts straight into ClickHouse. Grafana only reads; it is not the collector.

1. Back up the existing ClickHouse instance. Create a dedicated `openpanel`
   database. Do not point first-run migrations at a database containing unrelated
   tables: upstream migrations can rename existing tables during upgrades.
2. Build the API with `docker/openpanel-api/Dockerfile` (pinned 2.3.0 plus
   the verified fixes), build the dashboard with
   `docker/openpanel-dashboard/Dockerfile`, and use the upstream 2.3.0 worker, plus
   PostgreSQL and Redis with persistent volumes. Redis needs expired-key events
   (`notify-keyspace-events Ex`) and the `noeviction` policy.
3. Set `SELF_HOSTED=true`, `NODE_ENV=production`, `DATABASE_URL`,
   `DATABASE_URL_DIRECT`, `REDIS_URL`, `CLICKHOUSE_URL`, `COOKIE_SECRET`,
   `ENCRYPTION_KEY`, `API_URL`, `DASHBOARD_URL`. The ClickHouse URL includes
   `/openpanel`. Use platform-managed secret variables. Use private hostnames
   for the database connections and URL-encode special characters in credentials.
4. Run upstream database migrations once before starting the worker:
   `CI=true pnpm -r run migrate:deploy`. A migration failure must stop startup.
   The migration/app user needs OpenPanel's schema privileges; the Grafana reader
   does not. Do not reuse an insert-only telemetry user for these migrations.
5. For platforms with separate service domains, deploy `docker/web` in front of
   the dashboard and API. Set its `API_UPSTREAM` and `DASHBOARD_UPSTREAM` to their
   private hostnames and ports. This uses [Caddy path routing](https://caddyserver.com/docs/caddyfile/directives/handle_path/)
   to serve the API at `/api` and the frontend at `/` on one HTTPS origin.
   Set `API_URL=https://your-web-host/api`, `DASHBOARD_URL=https://your-web-host`,
   and `CUSTOM_COOKIE_DOMAIN=your-web-host` on the API and dashboard. Do not use
   shared cookies across unrelated platform domains such as `up.railway.app`.
   Set `API_URL_SSR=http://your-private-api:3000` on the dashboard for internal SSR.
   Publish only the OpenPanel HTTP frontend/API through HTTPS with the paths
   configured in `API_URL` and `DASHBOARD_URL`. Keep ClickHouse, PostgreSQL and
   Redis private. Add backups, retention, monitoring and resource limits before
   receiving real data. Disable open registration after the initial account.
6. Give Grafana SELECT on just the analytics tables. Existing read users may need
   two additional grants. Example below; run only with your chosen admin account.

```sql
GRANT SELECT ON openpanel.events TO grafana_ro;
GRANT SELECT ON openpanel.sessions TO grafana_ro;
```

The [ClickHouse plugin documentation](https://grafana.com/docs/plugins/grafana-clickhouse-datasource/latest/)
explains read-only settings. In particular, allow `max_execution_time` to be
changed while retaining `readonly=1`; Grafana sets query timeouts.

7. In Grafana Cloud, assign the ClickHouse datasource to the PDC network and use
   the internal ClickHouse hostname/port. Run Save & test, then the schema doctor
   and dashboard queries. Remove an existing public database endpoint only after
   the private connection is verified and other consumers have been checked.
8. Create one OpenPanel project/client for each website. Restrict allowed origins
   exactly, enable only the tracking you need, and verify a synthetic event before
   rolling out to all sites.

No permanent Railway resources are created by this repository's demo scripts.
Its loopback bindings and generated secrets are intended for evaluation. Follow
the [upstream v2 self-hosting guide](https://openpanel.dev/docs/self-hosting/v2/get-started)
for installation changes. Version 3 uses a different deployment and is outside
this kit's tested compatibility.
