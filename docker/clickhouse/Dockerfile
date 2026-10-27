ARG CLICKHOUSE_IMAGE=clickhouse/clickhouse-server:25.10.2.65
FROM ${CLICKHOUSE_IMAGE}
COPY init.sh /docker-entrypoint-initdb.d/10-grafana.sh
COPY limits.xml /etc/clickhouse-server/config.d/demo-limits.xml
