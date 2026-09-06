# Working Log

This file records current public collaboration state and durable implementation constraints.

## Current Status

The Three.js scene, six presets, auto demo, reloadable five-bone GLB, local MediaPipe CPU Worker, upper-body retargeting, cleanup paths, and local verification suites are implemented. Public English documentation and the canonical character-motion skill are present. GitHub Actions and Pages deployment are staged separately.

## Invariants

- Initial load does not request camera access or load pose inference assets.
- Tracking requires a user action, requests no audio, and keeps inference in a CPU Worker.
- Runtime assets are same-origin and pinned by version, size, and SHA-256 where applicable.
- The rig has exactly five bones and no elbow, leg, or foot behavior.
- Presets remain available without camera tracking.
- `skills/index.md` is the only skill router.
- The MIT license applies only to original code; third-party software, models, and character rights remain separate.
- Local references, camera media, screenshots, generated reports, and ignored assets never enter the public tree.

## Changelog

### 2026-09-05

- Established the public license and exact third-party distribution notices.
- Added English project, product, architecture, and agent documentation.
- Replaced the legacy modeling-only skill with one end-to-end character motion reference and a single router.
- Recorded the five-bone whole-flipper contract, local CPU Worker boundary, release hygiene, and reproducible validation expectations.
- Added an English-default interface with a persistent Chinese option and localized visible state, hint, error, and accessibility text.
