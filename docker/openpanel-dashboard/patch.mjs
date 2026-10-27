// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const filename='/app/apps/start/.output/server/chunks/_/router-qqI-F18U.mjs';
let source=readFileSync(filename,'utf8');
if(createHash('sha256').update(source).digest('hex')!=='d117dbaf3552f684b14b9e2dcdf5145155565767b68baee21137725168983f19') throw new Error('Unsupported dashboard bundle');
for(const line of ['  console.log("ENVS", process.env);\n','  console.log("API_URL_SSR", process.env.API_URL_SSR);\n','  console.log("baseUrl", baseUrl);\n']) {
  if(source.split(line).length!==2) throw new Error('Unexpected dashboard logging anchor');
  source=source.replace(line,'');
}
// Request options contain session cookies and mutation bodies. Never log them.
if(source.split('              options\n').length!==3) throw new Error('Unexpected SSR error logging anchors');
source=source.replaceAll('              options\n','');
source=source.replace('              body: text,\n','');
writeFileSync(filename,source);
console.log('Removed environment and request dumps from the pinned dashboard.');
