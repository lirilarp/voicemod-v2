import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve('/home/runner/work/voicemod-v2/voicemod-v2');
const dist = resolve(root, 'dist');
const distServer = resolve(root, 'dist-server');
const downloadsDir = resolve(dist, 'downloads');

await mkdir(downloadsDir, { recursive: true });

const versionMeta = JSON.parse(await readFile(resolve(dist, 'version.json'), 'utf8'));

const clientArchive = resolve(downloadsDir, `voicemod-v2-client-${versionMeta.version}.tar.gz`);
const serverArchive = resolve(downloadsDir, `voicemod-v2-server-${versionMeta.version}.tar.gz`);

const clientFiles = [
  'index.html',
  'download.html',
  'styles.css',
  'app.js',
  'download.js',
  'app-version.js',
  'version.json',
  'downloads.json',
  'README.md',
];

execFileSync('tar', ['-czf', clientArchive, '-C', dist, ...clientFiles], { stdio: 'inherit' });
execFileSync('tar', ['-czf', serverArchive, '-C', distServer, '.'], { stdio: 'inherit' });

async function artifactMeta(filePath, label) {
  const content = await readFile(filePath);
  const info = await stat(filePath);
  return {
    name: filePath.split('/').pop(),
    label,
    path: `./downloads/${filePath.split('/').pop()}`,
    sizeBytes: info.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

const artifacts = [
  await artifactMeta(clientArchive, 'Client Build Bundle'),
  await artifactMeta(serverArchive, 'Cloudflare Worker Server Bundle'),
];

const downloadMeta = {
  generatedAt: new Date().toISOString(),
  version: versionMeta.version,
  artifacts,
};

await writeFile(resolve(dist, 'downloads.json'), `${JSON.stringify(downloadMeta, null, 2)}\n`, 'utf8');

console.log('Release metadata complete: dist/downloads + dist/downloads.json');
