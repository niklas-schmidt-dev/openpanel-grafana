FROM lindesvard/openpanel-api:2.3.0@sha256:cee4855cd715a7248c5c49090fe93a28ffc505541de20cb238d8884a6bcb9223
COPY docker/openpanel-api/patch.mjs /tmp/opg-auth-patch.mjs
RUN node /tmp/opg-auth-patch.mjs /app/apps/api/dist/index.js
