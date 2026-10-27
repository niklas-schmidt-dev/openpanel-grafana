# Dashboard logging fix

This image pins OpenPanel 2.3.0 and removes an environment dump and request-option
dumps from its server-rendered frontend. Those logs could contain database
credentials or session cookies. The bundle hash is checked before patching.

The modified dashboard and patch are AGPL-3.0-only; see
[COPYING](../openpanel-api/COPYING). Complete upstream source and build instructions:
[OpenPanel cd24bb838301df1a9087e2e132b344e5b8a99963](https://github.com/Openpanel-dev/openpanel/tree/cd24bb838301df1a9087e2e132b344e5b8a99963).
`patch.mjs` and `Dockerfile` fully describe this modification. The web proxy links
to this source in its HTTP responses. Preserve that offer, and update it to your
own corresponding source when distributing additional changes.
