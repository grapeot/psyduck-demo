import { build } from 'vite';
// MediaPipe loads its WASM glue with importScripts. A prebundled classic
// worker keeps this working in Vite dev as well as the production bundle.
await build({ configFile: false, publicDir: false, build: {
  outDir: 'src/generated', emptyOutDir: true,
  lib: { entry: 'src/pose-worker.js', formats: ['iife'], name: 'PsyduckPoseWorker', fileName: () => 'pose-worker.js' },
} });
