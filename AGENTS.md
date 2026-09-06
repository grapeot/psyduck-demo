# Coding Agent Guidelines

This is a public, English-language Vite and Three.js reference project. The default branch is `master`.

## Boundaries

- Keep documentation, commit messages, pull requests, code comments, and skill files in English. Chinese is permitted only as localization data in `ui_copy.json` and related localization assertions.
- Never commit credentials, private hosts, machine-specific paths, camera media, local reference images, generated screenshots, `test-results/`, or ignored review reports.
- Preserve the existing Vite, Three.js, and MediaPipe architecture. Do not introduce a UI framework, backend, analytics, runtime secrets, or environment variables without an explicit product requirement.
- Preserve the `shoulder_flap` contract: exactly five bones, with each shoulder controlling one whole flipper. Do not add or promise elbows, legs, feet, detailed hands, or facial capture.
- Keep `skills/index.md` as the only root skill router. It links only to `skills/character-motion-reference.md`.

## Assets and Rights

`public/models/psyduck_rigged.glb` is committed. MediaPipe WASM files, the pose task, and legal distribution files are prepared into ignored `public/` paths and copied into the production build. Do not force-add ignored local assets.

The MIT license covers original project code only. Do not describe the character model or other third-party material as MIT licensed, and do not claim this repository grants third-party character rights. Preserve `THIRD_PARTY_NOTICES.md`, `licenses/Apache-2.0.txt`, and the legal files generated into `dist/legal/`.

## Verification

Run checks relevant to each change. Before release, run the full suite:

```bash
npm test
npm run build
npm run test:browser
npm run test:dev
npm run test:clean-build
```

Browser tests require local Chrome through Playwright `channel: chrome`. They use synthetic streams and public fixtures, never a physical camera. Rig changes must be validated after GLB export and reload, including bone names, metadata, finite geometry, normalized weights, shoulder continuity, whole-flipper deformation, and multiple silhouettes.
