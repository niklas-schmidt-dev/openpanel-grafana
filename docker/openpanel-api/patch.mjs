// SPDX-License-Identifier: AGPL-3.0-only
// Auth hardening for the pinned OpenPanel 2.3.0 bundle; see README.md here.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const filename = process.argv[2];
if (!filename) throw new Error('Expected the OpenPanel API bundle path');
let source = readFileSync(filename, 'utf8');
const expected = 'b6b290e5c2113ceaf53d45ec2e78ca39c2ea9070430809ba99146e290f96d061';
if (createHash('sha256').update(source).digest('hex') !== expected) throw new Error('Unsupported OpenPanel bundle. Refusing to apply an unverified patch.');
const early = '\tif (clientSecret) req$2.clientSecretAuth = true;';
const anchor = '\tconst revenue = path$1([';
if (source.split(early).length !== 2 || source.split(anchor).length !== 2) throw new Error('Auth patch anchor is not unique.');
source = source.replace(early, '').replace(anchor, `
\t// Verify a supplied secret before any Origin or ignoreCorsAndSecret shortcut.
\tif (clientSecret) {
\t\tif (!client.secret || !await verifyPassword(clientSecret, client.secret)) throw createError$7("Ingestion: Invalid client secret");
\t\treq$2.clientSecretAuth = true;
\t}
${anchor}`);
writeFileSync(filename, source);
console.log('Applied pinned OpenPanel client-secret verification patch.');

const migration = '/app/packages/db/code-migrations/14-profile-event-property-summary-mv.ts';
let migrationSource = readFileSync(migration,'utf8');
if (createHash('sha256').update(migrationSource).digest('hex') !== 'e640eee65409326d73acb7d022e1be58e8b0bb8235a2065a992600f6f7d42637') throw new Error('Unsupported profile-property migration.');
const sortingKey = "          'property_key',\n          'event_date',";
if (migrationSource.split(sortingKey).length !== 2) throw new Error('Migration patch anchor is not unique.');
migrationSource = migrationSource.replace(sortingKey,"          'property_key',\n          'property_value',\n          'event_date',");
writeFileSync(migration,migrationSource);
console.log('Included property_value in the profile-property aggregate sorting key.');
