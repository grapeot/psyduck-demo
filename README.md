# Psyduck Three.js Motion Demo

A browser-based 3D reference implementation for preset character animation and optional local upper-body pose retargeting with Three.js and MediaPipe Tasks Vision.

- Live demo: https://grapeot.github.io/psyduck-demo/
- Source: https://github.com/grapeot/psyduck-demo

## Capabilities

The page provides idle, raise-one-arm, arms-spread, hold-head, head-tilt, and body-sway presets plus an automatic demo. Presets work without camera access.

Optional camera tracking maps shoulder-to-wrist direction, head tilt, and torso lean onto a reloadable GLB. The `shoulder_flap` rig has exactly five bones: `root`, `torso`, `head`, `leftArm`, and `rightArm`. Each shoulder drives one whole flipper; there are no elbow bones or two-link arm IK.

## Privacy

Initial page load neither requests camera access nor loads pose-inference resources. Tracking starts only after a user action and requests video with `audio: false`.

Frames are transferred to a local CPU WebAssembly Worker. The app has no backend or analytics, and production assets load from the same origin. Browser tests exercise actual Worker inference and fail if they observe a non-GET or external request. Static page and asset downloads still use the network normally.

Stopping, hiding the page, model failure, frame timeout, or a camera interruption closes available frames and media tracks and terminates the Worker. Presets remain available when camera tracking cannot start.

## Local Development

Use Node.js 22 or newer and npm:

```bash
npm ci
npm run prepare:assets
npm start
```

Asset preparation verifies the pinned Pose Landmarker Lite model and MediaPipe WASM files before copying them into ignored local directories. The build also includes the project and third-party license files in its static output. Camera access requires localhost or HTTPS and explicit browser permission.

The repository includes `public/models/psyduck_rigged.glb`. Rebuild it with `npm run generate:rig`; the generator uses `psyduck_neutral.glb` and local Chrome.

## Verification

```bash
npm test
npm run build
npm run test:browser
npm run test:dev
npm run test:clean-build
```

Browser tests use Playwright with `channel: chrome`, synthetic media streams, an empty-frame CPU Worker check, and a pinned public fixture that produces 33 landmarks. They do not activate a physical camera. The clean-build test installs and builds from a fresh copy of the Git candidate tree without reusing ignored asset caches.

## Scope

The current implementation tracks one person's upper-body motion. It does not implement legs or feet, full-body movement, detailed hands or fingers, facial expressions, fast turns, physical contact solving, or a main-thread inference fallback.

Historical rendering scripts and `static.html` remain available for reference, but some require excluded local research artifacts and are not part of the reproducible production path.

## Project References

- [Product requirements](docs/prd.md)
- [Architecture](docs/rfc.md)
- [Working log](docs/working.md)
- [Character motion skill router](skills/index.md)
- [Asset manifest](asset-manifest.json)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License and Character Rights

Original project code is released under the [MIT License](LICENSE), copyright 2026 Yan Wang. Bundled and redistributed components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [Apache License, Version 2.0](licenses/Apache-2.0.txt).

This repository is an unofficial fan and technical reference implementation. It is not affiliated with, endorsed by, or sponsored by Nintendo, The Pokémon Company, Game Freak, or their affiliates. Pokémon, Psyduck, and related character rights belong to their respective owners. The MIT license covers original project code only and grants no rights to third-party characters, names, trademarks, artwork, models, or other third-party material.
