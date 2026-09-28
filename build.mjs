import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('/home/runner/work/voicemod-v2/voicemod-v2');
const dist = resolve(root, 'dist');

const copyFiles = [
  'index.html',
  'download.html',
  'styles.css',
  'app.js',
  'download.js',
  'README.md',
];

const sourceVersionInputs = [
  ...copyFiles,
  'worker/src/index.js',
  'worker/wrangler.toml',
  'build.mjs',
  'build-server.mjs',
  'build-release.mjs',
  'package.json',
];

async function computeVersion() {
  const hash = createHash('sha256');
  for (const file of sourceVersionInputs) {
    const content = await readFile(resolve(root, file));
    hash.update(file);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  const sourceHash = hash.digest('hex');
  const builtAt = new Date().toISOString();
  const stamp = builtAt.replace(/[-:TZ.]/g, '').slice(0, 14);
  const version = `${stamp}-${sourceHash.slice(0, 12)}`;
  return { version, sourceHash, builtAt };
}

const versionMeta = await computeVersion();

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of copyFiles) {
  await cp(resolve(root, file), resolve(dist, file));
}

await writeFile(
  resolve(dist, 'app-version.js'),
  `export const APP_VERSION = '${versionMeta.version}';\n`,
  'utf8'
);

await writeFile(resolve(dist, 'version.json'), `${JSON.stringify(versionMeta, null, 2)}\n`, 'utf8');
await writeFile(
  resolve(dist, 'downloads.json'),
  `${JSON.stringify({ generatedAt: versionMeta.builtAt, version: versionMeta.version, artifacts: [] }, null, 2)}\n`,
  'utf8'
);

console.log(`Build complete: dist/ (version ${versionMeta.version})`);
