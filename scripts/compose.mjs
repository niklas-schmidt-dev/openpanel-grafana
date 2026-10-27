import { compose } from './docker.mjs';
compose(process.argv.slice(2), undefined, true);
