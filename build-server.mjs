import { mkdir, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('/home/runner/work/voicemod-v2/voicemod-v2');
const source = resolve(root, 'worker');
const dist = resolve(root, 'dist-server');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'src'), { recursive: true });

await cp(resolve(source, 'src', 'index.js'), resolve(dist, 'src', 'index.js'));
await cp(resolve(source, 'wrangler.toml'), resolve(dist, 'wrangler.toml'));
await cp(resolve(source, 'package.json'), resolve(dist, 'package.json'));

console.log('Server build complete: dist-server/');
