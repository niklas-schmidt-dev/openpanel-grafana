# Shared ClickHouse across Railway projects

```mermaid
flowchart LR
  Websites --> API[OpenPanel API]
  subgraph OpenPanel project
    API --> Redis
    Worker --> Redis
    API --> PostgreSQL
    Worker --> PostgreSQL
    Dashboard --> API
  end
  subgraph ClickHouse project
    Gateway[Authenticated HTTPS gateway] --> CH[Central ClickHouse]
    PDC --> CH
  end
  API -->|TLS + gateway secret| Gateway
  Worker -->|TLS + gateway secret| Gateway
  Dashboard -->|TLS + gateway secret| Gateway
  Grafana[Grafana Cloud] --> PDC
```

The gateway is a small HTTP transport adapter, not an analytics collector. It is
optional when OpenPanel can reach ClickHouse directly on a private network.

Deploy `docker/gateway/Dockerfile` with `docker/gateway` as its build context,
in the **same project/environment as ClickHouse**. Set these secret variables:

| Variable | Value |
| --- | --- |
| `CLICKHOUSE_URL` | `http://clickhouse.railway.internal:8123` (use your actual private hostname/port) |
| `CLICKHOUSE_USER` | A dedicated `openpanel_app` user |
| `CLICKHOUSE_PASSWORD` | That user's generated password |
| `CLICKHOUSE_DATABASE` | `openpanel` |
| `GATEWAY_TOKEN` | A random secret of at least 32 characters; use 32 random bytes encoded as hex |
| `PORT` | `8080` |

Create only the gateway's HTTPS domain. In the separate OpenPanel project set
`CLICKHOUSE_URL=https://openpanel:GATEWAY_TOKEN@gateway-host/openpanel` on the
API, worker and dashboard. Never put this URL into browser code. Keep the admin
database password out of both the gateway and OpenPanel.

The gateway accepts `GET`/`POST` on `/` and `/ping`, protected by HTTP Basic auth
with username `openpanel` and the gateway token. `GET /healthz` reports process
health without database access. Requests are limited to 16 MiB (compressed size
when gzip is used), 8 concurrent authenticated requests, 8 KiB URLs and a 310 s
upstream timeout. Oversize/overload requests receive 413/429. No CORS headers or
request-body logging are enabled. Railway terminates HTTPS; do not expose this
plain HTTP process directly to the Internet.

The gateway discards request-supplied database identities and forces the configured
database. **ClickHouse grants remain the authorization boundary**, because SQL
can still name other databases explicitly. Grant the dedicated user access only
to `openpanel.*`, and bound execution time (OpenPanel inserts request 300 s),
memory and threads. Grafana uses its separate read-only account over PDC.

Rotate the gateway token and ClickHouse password independently, updating each
consumer. Back up ClickHouse and PostgreSQL separately. Project separation is
not a backup strategy or a replacement for database authorization.

TLS protects the connection but traffic between Railway projects uses public
networking and can incur egress charges. This design is not a private network
between projects. If private-only transport is mandatory, keep the services in
one project/environment or provide an independently managed private tunnel.
