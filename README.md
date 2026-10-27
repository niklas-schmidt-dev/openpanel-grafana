# OpenPanel → ClickHouse → Grafana

Portable Grafana dashboards for self-hosted [OpenPanel](https://openpanel.dev).
Keep OpenPanel's tracking SDK, ingestion and identity handling. Query your own
ClickHouse with Grafana. No extra collector, export job or paid service required.

**Already running OpenPanel? Import a JSON file, select your ClickHouse datasource,
and choose your database and projects.**

| Dashboard | What it answers |
| --- | --- |
| [Overview](dashboards/opg-overview.json) | Pageviews, observed visitors, sessions, bounce rate, pages, countries, devices |
| [Acquisition](dashboards/opg-acquisition.json) | Session-entry referrers, UTM campaigns, landing pages |
| [Funnel](dashboards/opg-funnel.json) | Three ordered events in the same session within 30 minutes |
| [Revenue](dashboards/opg-revenue.json) | Recorded gross revenue by currency, project and time |

## Connect an existing installation

1. Install Grafana's official `grafana-clickhouse-datasource` plugin.
2. Create a ClickHouse datasource using a **read-only** account with `SELECT`
   access to `openpanel.events` and `openpanel.sessions`. Use a private network
   or Grafana Cloud PDC. Your ClickHouse admin account never belongs in Grafana.
3. In Grafana, choose **Dashboards → New → Import**, upload one of the JSON files
   above and select the datasource. Repeat for the other dashboards.
4. Select the OpenPanel database and project IDs. All projects are supported;
   identities are counted separately for each project. The database dropdown
   intentionally allows ordinary SQL identifiers only.

No SQL migrations or views are needed. OpenPanel creates and owns its tables.
This kit only reads them. It works with **self-hosted OpenPanel data**, not an
arbitrary ClickHouse database or OpenPanel Cloud without database access.

Tested versions: OpenPanel **2.3.0 with the patches below**, ClickHouse **25.10.2.65** (and a compatibility run on **26.9.25.15**), Grafana **12.3.0**,
ClickHouse plugin **4.23.2**. OpenPanel 3 and other schemas are not certified.
Before upgrading, run the schema check and the integration tests.

```sh
# Set these in your shell/secret manager; do not commit their values.
export CLICKHOUSE_URL=https://your-clickhouse-host:8443
export CLICKHOUSE_USER=grafana_ro
export CLICKHOUSE_DATABASE=openpanel
# CLICKHOUSE_PASSWORD must already be set securely.
pnpm schema:check
```

See [existing ClickHouse / Railway setup](docs/deployment.md) and
[metric definitions](docs/metrics.md).

## Add your websites

Create one OpenPanel project per website, allow its exact origin, and create a
write client. Use the official OpenPanel SDK for your framework. The browser
gets the **public client ID**, never a client secret or ClickHouse credentials.

```ts
import { OpenPanel } from '@openpanel/web';

const analytics = new OpenPanel({
  apiUrl: 'https://analytics.example.com/api',
  clientId: 'YOUR_OPENPANEL_CLIENT_ID',
  trackScreenViews: true,
  trackOutgoingLinks: false,
  trackAttributes: false,
});

analytics.track('signup', { plan: 'free' });
```

Verify your installed SDK's exports against the [official SDK docs](https://openpanel.dev/docs/sdks).
For a website without a build step, see [the script example](examples/website.html).
For authenticated backend revenue, see [the server example](examples/revenue.mjs).
Keep event properties small and avoid emails, names, authentication tokens,
free-text form values and sensitive URL parameters. Self-hosting alone does not
make every tracking configuration anonymous or consent-free.

## Run the isolated demo

Requirements: Node 22+, pnpm, Docker Compose v2, and about 6 GB free RAM for
the full temporary stack. It starts OpenPanel API/dashboard/worker, PostgreSQL,
Redis, ClickHouse, a scoped database gateway and Grafana. This is a test environment, not a production
deployment template: no public endpoints, backups, TLS termination or mail setup.

```sh
pnpm install --frozen-lockfile
# If installed, run your per-checkout dev-scope before setup:
eval "$(~/.local/bin/dev-scope)"
pnpm demo:setup
pnpm demo:up
pnpm test:integration
pnpm schema:check --demo
```

`demo:setup` creates an ignored `.env` with random secrets and a unique Compose
project name; it preserves an existing `.env`. No fixed ports, shared container
names or host bind mounts are used. The author’s macOS setup defaults to the `nas-docker` context. Set
`DOCKER_CONTEXT` before setup to select your own Docker host. Every command uses
that context explicitly; no daemon is started or switched automatically.

To view Grafana, install [Portless](https://github.com/vercel-labs/portless) and run:

```sh
portless run --name "grafana.${DEV_NAMESPACE:-opg}" node scripts/proxy.mjs
```

The proxy reads the allocated Compose port. With an SSH Docker context it opens
an SSH tunnel, so loopback ports stay private on the Docker host. Log in as
`admin` with `GRAFANA_ADMIN_PASSWORD` from your local `.env`. Use a different
Portless name for each checkout; never take over someone else's route.

The OpenPanel dashboard and API can use separate proxies with `OPG_SERVICE=dashboard`
or `OPG_SERVICE=api`. To use the OpenPanel UI, set `API_URL` and `DASHBOARD_URL` in
`.env` to those actual URLs, then recreate the app services. The automated test
creates its own synthetic project directly in the isolated PostgreSQL database.

Stop your proxy with Ctrl+C and run `pnpm demo:down` when finished. Named volumes
are retained. To deliberately remove this demo's data, run
`node scripts/compose.mjs down --volumes`; that destroys only the named project.

## Development

`scripts/generate.mjs` is the source for all four exported dashboards.

```sh
pnpm generate
pnpm test
pnpm test:integration
```

The integration test sends real HTTP tracking requests, waits for the worker to
persist them, and executes every dashboard and variable query through Grafana's
actual ClickHouse plugin. Adversarial fixtures cover project isolation, session
corrections, funnel order/time windows, mixed currencies, and read-only credentials.
Fixtures use the tables created by OpenPanel migrations. Tests only target the
isolated demo; they do not accept a production URL.

Each run keeps synthetic data and writes `.local/verification.json`. A new checkout
gets separate volumes, ports and runtime state. See [verification](docs/verification.md)
for the checks completed on the initial release.

## License and upstream

The dashboards, gateway and tooling are MIT licensed. The OpenPanel patches in `docker/openpanel-api` and `docker/openpanel-dashboard` are AGPL-3.0-only. OpenPanel is a
separate upstream project with its own [AGPL-3.0 license](https://github.com/Openpanel-dev/openpanel/blob/v2.3.0/LICENSE.md).
Its full source is not vendored here. The demo builds a patched API and dashboard from pinned official images and pulls the official worker image;
review upstream licensing before modifying or redistributing them. Grafana and
the ClickHouse plugin retain their respective upstream licenses.

Schema reference: [OpenPanel v2.3.0](https://github.com/Openpanel-dev/openpanel/tree/v2.3.0),
commit `cd24bb838301df1a9087e2e132b344e5b8a99963`, especially the event/session
migrations and tracking validation. This is an independent community kit.

## Pinned OpenPanel fixes

The optional demo/deployment API image includes two small, hash-checked upstream
fixes: supplied client secrets must be verified before allowed-Origin shortcuts,
and the profile-property aggregate includes `property_value` in its sorting key.
The latter prevents different values being merged together and allows fresh
migrations on ClickHouse 26.9. See [patch details and source](docker/openpanel-api/README.md).
The migration fix is for fresh installations; it does not rebuild an already
existing materialized view. Existing OpenPanel operators should assess that table
separately before upgrading. The Grafana dashboards query the raw event/session
tables and do not depend on that materialized view.

## Separate Railway projects

Railway private networking does not cross project boundaries. To keep one shared
ClickHouse project, the optional [database gateway](docs/gateway.md) runs beside
ClickHouse and exposes an authenticated HTTPS endpoint for the separate OpenPanel
project. ClickHouse itself keeps its public HTTP and TCP endpoints disabled. The
gateway uses a fixed database account restricted to `openpanel.*`; it never accepts
an upstream username or password supplied by a request.
