#!/bin/bash
set -euo pipefail
clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" \
  --param_password="$GRAFANA_CH_PASSWORD" --param_app_password="$OPENPANEL_CH_PASSWORD" --multiquery <<'SQL'
CREATE USER IF NOT EXISTS grafana_ro IDENTIFIED WITH sha256_password BY {password:String};
GRANT SELECT ON openpanel.events TO grafana_ro;
GRANT SELECT ON openpanel.sessions TO grafana_ro;
ALTER USER grafana_ro SETTINGS readonly=1, max_execution_time=30 CHANGEABLE_IN_READONLY, max_memory_usage=536870912, max_threads=2;
CREATE USER IF NOT EXISTS openpanel_app IDENTIFIED WITH sha256_password BY {app_password:String};
GRANT ALL ON openpanel.* TO openpanel_app;
ALTER USER openpanel_app SETTINGS max_execution_time=300 MAX 300, max_memory_usage=1073741824 MAX 1073741824, max_threads=2 MAX 2;
SQL
