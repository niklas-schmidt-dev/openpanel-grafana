# OpenPanel 2.3.0 fixes

The demo and deployment build this narrowly patched OpenPanel **2.3.0** API.
The stock 2.3.0 image can take an allowed-Origin shortcut before validating a
supplied client secret. The patch requires a supplied secret to validate before
either the Origin shortcut or the `ignoreCorsAndSecret` shortcut, and only then
marks the request as secret-authenticated. Anonymous browser events still use
the project's allowed origins.

The original image is pinned by digest and its compiled API bundle is checked
against SHA-256 before changing anything. A different bundle fails the build;
there is no silent fallback to an unpatched API. The integration tests cover
valid and invalid secrets, header/body credentials, valid Origins and
origin-less backend traffic. This is a targeted fix, not a full upstream audit.

## Source and license

The patch is AGPL-3.0-only, as is the resulting modified OpenPanel API. See
[COPYING](COPYING). This directory is an exception to the kit's MIT license.

Complete upstream source and build instructions:
[OpenPanel commit cd24bb838301df1a9087e2e132b344e5b8a99963](https://github.com/Openpanel-dev/openpanel/tree/cd24bb838301df1a9087e2e132b344e5b8a99963).
The modification is completely described by `patch.mjs`. `Dockerfile` rebuilds
the patched image from the exact official image. Users of a deployed modified
instance must be offered access to this corresponding source and upstream source
as required by the upstream license. Keep this source link in the deployment's
documentation. The patched API also serves a public `/source` page and includes
a `Link` header pointing to these sources in every response. Do not remove
upstream notices. If you distribute further changes, update both links to your
own complete corresponding source.

After upgrading upstream, verify the fix there and remove this patch when the
same regression tests pass against the official image. Do not loosen the hash
check just to make a new image build.

## Profile-property aggregation on ClickHouse 26.9

The second patch adds `property_value` to the sorting key in migration 14. The
query groups by that dimension, so omitting it can collapse different property
values during background merges. ClickHouse 26.9 rejects the unsafe definition.
The migration source is independently hash-checked before patching. This changes
the initial DDL only; existing installations need a separately planned rebuild
of their materialized view. No existing user tables are rewritten by this kit.
