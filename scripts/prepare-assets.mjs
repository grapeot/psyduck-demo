import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function prepareAssets(root = process.cwd(), download = fetch) {
  const manifest = JSON.parse(await readFile(resolve(root, 'asset-manifest.json'), 'utf8'));
  const packageRoot = resolve(root, 'node_modules/@mediapipe/tasks-vision');
  const installed = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  if (installed.version !== manifest.version) throw new Error('MediaPipe package/manifest version mismatch');
  const valid = (bytes, entry) => bytes.length === entry.bytes && createHash('sha256').update(bytes).digest('hex') === entry.sha256;
  const cached = async path => {
    try { return await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return Buffer.alloc(0); }
  };
  await mkdir(resolve(root, 'public/vision'), { recursive: true });
  await mkdir(resolve(root, 'public/models'), { recursive: true });
  for (const entry of manifest.runtime) {
    const source = await readFile(resolve(packageRoot, 'wasm', entry.file));
    if (!valid(source, entry)) throw new Error(`Pinned WASM package hash mismatch: ${entry.file}`);
    const destination = resolve(root, 'public/vision', entry.file);
    if (!valid(await cached(destination), entry)) await writeFile(destination, source);
  }
  const destination = resolve(root, 'public/models/pose_landmarker_lite.task');
  const modelCached = valid(await cached(destination), manifest.model);
  if (!modelCached) {
    const response = await download(manifest.model.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Model download: ${response.status}`);
    const model = Buffer.from(await response.arrayBuffer());
    if (!valid(model, manifest.model)) throw new Error('Pinned model hash/size mismatch');
    await writeFile(destination, model);
  }
  // The committed manifest is an input, never rewritten to bless new bytes.
  if (!valid(await readFile(destination), manifest.model)) throw new Error('Model verification after preparation failed');
  console.log({ modelCached, sha256: manifest.model.sha256, runtimeFiles: manifest.runtime.length });
  return { modelCached };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareAssets();
  await import('./prepare-worker.mjs');
}
