import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

export const config = {...parseEnv(readFileSync('.env', 'utf8')), ...process.env};
config.BUILDX_CONFIG ||= resolve('.local/buildx');
mkdirSync(config.BUILDX_CONFIG, {recursive: true});
export const context = config.DOCKER_CONTEXT || (process.platform === 'darwin' ? 'nas-docker' : 'default');
export const project = config.COMPOSE_PROJECT_NAME;
if (!project || !/^[a-z0-9][a-z0-9_-]+$/.test(project)) throw new Error('Run pnpm demo:setup first.');
export function compose(args, input, inherit = false) {
  const result = spawnSync('docker', ['--context', context, 'compose', '-p', project, ...args], {
    env: config, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: inherit ? 'inherit' : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Compose ${args[0]} failed (${result.status}): ${(result.stderr || result.stdout || '').slice(-3000)}`);
  return result.stdout;
}
export const exec = (service, args, input) => compose(['exec', '-T', service, ...args], input);
