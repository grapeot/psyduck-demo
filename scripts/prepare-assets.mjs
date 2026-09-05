import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './prepare-worker.mjs';
const version = '0.10.22-rc.20250304';
const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
await mkdir('public/vision', { recursive: true });
await mkdir('public/models', { recursive: true });
const files = await readdir('node_modules/@mediapipe/tasks-vision/wasm');
for (const file of files) await copyFile(`node_modules/@mediapipe/tasks-vision/wasm/${file}`, `public/vision/${file}`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Model download: ${response.status}`);
const model = Buffer.from(await response.arrayBuffer());
if (model.length < 1000000 || model.readUInt32LE(2) !== 0x04034b50 || !model.includes(Buffer.from('pose_landmarks_detector.tflite'))) throw new Error('Invalid task archive');
const sha256 = createHash('sha256').update(model).digest('hex');
let previous;
try { previous = JSON.parse(await readFile('asset-manifest.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (previous && previous.model.sha256 !== sha256) throw new Error('Pinned model hash changed');
await writeFile('public/models/pose_landmarker_lite.task', model);
const runtime = [];
for (const file of files) {
  const bytes = await readFile(`public/vision/${file}`);
  runtime.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('asset-manifest.json', JSON.stringify({ package: '@mediapipe/tasks-vision', version, model: { url, sha256, bytes: model.length }, runtime,
  licensing: { runtime: 'Apache-2.0; see node_modules/@mediapipe/tasks-vision/README.md and upstream LICENSE', model: 'MediaPipe published Pose Landmarker Lite model; https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker#models ; upstream MediaPipe Apache-2.0. Review model redistribution terms before public release.', character: 'Pokemon/Psyduck character rights are separate; no character-rights license is granted by this project.', references: 'Historical third-party reference images are excluded from commit and production assets.' }
}, null, 2) + '\n');
console.log({ sha256, bytes: model.length, runtimeFiles: runtime.length });
