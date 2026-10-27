FROM lindesvard/openpanel-dashboard:2.3.0@sha256:b773cf864454a0ec89b2a133b48bf06202880ed650a75cc2f1f5c87aaed1cffa
COPY docker/openpanel-dashboard/patch.mjs /tmp/opg-dashboard-patch.mjs
RUN node /tmp/opg-dashboard-patch.mjs
