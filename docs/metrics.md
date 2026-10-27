# Metric definitions

The dashboard date range is applied to event `created_at`, or to session start
`created_at` for session metrics. Sessions that start before the range are excluded.

- **Pageviews:** `screen_view` rows. OpenPanel handles ingestion deduplication;
  this kit does not turn tracking events into a transactional ledger.
- **Observed visitors:** distinct `(project_id, profile_id)` pairs on pageviews,
  excluding blank IDs. Anonymous IDs can rotate, and identification can change IDs.
  This is not a cross-device, cross-project count of human beings.
- **Sessions:** sum of `sign`. OpenPanel uses a versioned collapsing table;
  counting rows or filtering `sign=1` double-counts revisions before merges.
- **Bounce rate:** signed bounce sum / signed session sum. Live sessions may change.
- **Acquisition:** attributes from the session entry, not lifetime first touch.
  Sources are not attributed revenue; that requires a separately defined identity
  and attribution policy.
- **Funnel:** three configurable event names, strictly increasing timestamps,
  same project and nonempty session, within 30 minutes. All events must be inside
  the dashboard time range. Events at the same timestamp do not establish order.
  Server events not linked to a session cannot complete this funnel.
- **Revenue:** the sum of `revenue` on `name='revenue'` rows, in integer minor
  units, filtered by the `currency` property (uppercase). No FX conversion. A
  missing currency becomes `UNSPECIFIED`, never silently EUR or USD. The coverage
  table shows different currencies separately; do not sum its rows.

OpenPanel v2.3.0 validates nonnegative integer revenue and stores it as UInt64.
This dashboard therefore represents **gross recorded amounts**, not net revenue,
MRR, recognized revenue, refunds or profit. EUR/USD minor units are cents; JPY
minor units are yen. The kit intentionally does not assume every currency has
two decimal places. Include an order ID for investigation, but deduplicate
payment provider events in your application before forwarding them.

Dashboard filtering is not tenant access control. Give each untrusted team a
separate datasource/database role or ClickHouse row policy. Users with datasource
query permission can issue their own SQL, independent of the dropdown selections.
