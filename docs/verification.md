# Verification

Run on 2026-10-27 against isolated Docker projects on a remote Linux Docker host.

- 58 integration checks passed on ClickHouse 25.10.2.65.
- 58 integration checks passed on ClickHouse 26.9.25.15 after fresh OpenPanel migrations.
- The two full stacks ran concurrently with distinct volumes, PostgreSQL project data, loopback ports and Portless URLs.
- Actual tracking HTTP requests traversed the API, Redis/worker, authenticated gateway and ClickHouse. Every dashboard and variable query ran through Grafana 12.3.0 with plugin 4.23.2, for All/single/multiple projects.
- Assertions covered missing and invalid credentials (header and body), browser/backend revenue, integer minor units, gateway identity isolation, denied account-table access, denied Grafana writes, session revisions, project identity isolation, funnel order/window and currency isolation.
- The local Postman collection passed 4 assertions across 3 requests through a Portless HTTPS endpoint, with certificate validation enabled.
- The read-only schema check passed. Generated dashboard consistency tests passed.

Synthetic fixtures only. This does not establish payment-webhook exactly-once delivery, cross-device human identity, legal consent requirements, production load capacity or correctness of unrelated upstream features. The kit is not a financial ledger.

Integration tests retain synthetic data in their own volumes and save ignored reports under .local/. Production data is never a test fixture.
