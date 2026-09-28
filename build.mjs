import { mkdir, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('/home/runner/work/voicemod-v2/voicemod-v2');
const dist = resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'app.js', 'README.md'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(dist, file));
}

console.log('Build complete: dist/');
