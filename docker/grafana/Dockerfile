FROM grafana/grafana:12.3.0
USER root
RUN grafana cli --pluginsDir /usr/share/grafana/plugins plugins install grafana-clickhouse-datasource 4.23.2
USER grafana
ENV GF_PATHS_PLUGINS=/usr/share/grafana/plugins
COPY docker/grafana/provisioning /etc/grafana/provisioning
COPY .local/provisioned /etc/grafana/opg-dashboards
