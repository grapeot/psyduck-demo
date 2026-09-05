import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, access, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { prepareAssets } from '../scripts/prepare-assets.mjs';

// Read-only Git inventory includes the current candidate source edits, but
// never copies ignored caches, node_modules, test photos, or the parent repo.
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
assert.ok(files.includes('asset-manifest.json') && files.includes('tests/browser.mjs'));
for (const file of files) assert.ok(!/^(node_modules|dist|test-results|public\/vision|src\/generated)\/|^public\/models\/pose_landmarker_lite\.task$|\.jpg$/.test(file) && !file.startsWith('/') && !file.split('/').includes('..'), `Unexpected clean source: ${file}`);
await mkdir('test-results', { recursive: true });
const root = await mkdtemp(resolve('test-results/clean-build-'));
for (const file of files) { const dest = resolve(root, file); await mkdir(dirname(dest), { recursive: true }); await copyFile(file, dest); }
for (const path of ['node_modules', 'public/vision', 'public/models/pose_landmarker_lite.task']) {
  await assert.rejects(access(resolve(root, path)), { code: 'ENOENT' });
}
const report = { root, source: 'git ls-files --cached --others --exclude-standard, copied current candidate bytes', files, commands: [], assets: [] };
const pinnedManifest = await readFile(resolve(root, 'asset-manifest.json'), 'utf8');
function run(args) {
  const result = spawnSync('npm', args, { cwd: root, stdio: 'inherit', timeout: 300000 });
  report.commands.push({ command: `npm ${args.join(' ')}`, status: result.status, error: result.error?.message });
  assert.equal(result.status, 0, `Clean tree command failed: npm ${args.join(' ')}`);
}
try {
  run(['ci']);
  run(['run', 'build']);
  assert.equal(await readFile(resolve(root, 'asset-manifest.json'), 'utf8'), pinnedManifest);
  const manifest = JSON.parse(pinnedManifest);
  for (const [path, expected] of [['models/pose_landmarker_lite.task', manifest.model], ...manifest.runtime.map(e => [`vision/${e.file}`, e])]) {
    const data = await readFile(resolve(root, 'dist', path));
    assert.equal(data.length, expected.bytes); assert.equal(createHash('sha256').update(data).digest('hex'), expected.sha256);
    report.assets.push({ path, verified: true });
  }
  await access(resolve(root, 'dist/models/psyduck_rigged.glb'));
  report.cacheVerifiedWithoutNetwork = (await prepareAssets(root, () => { throw new Error('Valid model cache must not fetch'); })).modelCached;
  assert.ok(report.cacheVerifiedWithoutNetwork);
  run(['test']);
  run(['run', 'test:browser']);
  const browser = JSON.parse(await readFile(resolve(root, 'test-results/browser-report.json'), 'utf8'));
  assert.ok(browser.checks.realMediaPipe.timestamp > 0 && browser.checks.positiveMediaPipe.message.count === 33);
  report.browserChecks = browser.checks; report.passed = true;
} finally { await writeFile('test-results/clean-build-report.json', JSON.stringify(report, null, 2)); }
