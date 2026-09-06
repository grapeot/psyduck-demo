# Architecture: Web 3D and Local Pose Retargeting

**Status:** Implemented

## System Boundary

The application is a static Vite site. Three.js renders a reloadable skinned GLB on the main thread. Camera capture is optional; MediaPipe Pose Landmarker runs with the CPU delegate in a dedicated Web Worker. There is no backend, cloud inference path, analytics integration, or main-thread inference fallback.

## Data Flow

After an explicit user action, `CameraController` requests a user-facing video stream with `audio: false`. It creates at most one in-flight `ImageBitmap`, transfers ownership to the Worker, and waits for the matching result before scheduling another frame.

The Worker loads pinned same-origin MediaPipe WASM and Pose Landmarker Lite assets, runs `detectForVideo`, and returns normalized landmarks, frame dimensions, timestamp, and tracking-session ID. The main thread accepts only the current session and matching timestamp. `Retarget` uses shoulder-to-wrist vectors, shoulder slope, facial landmarks for limited head tilt, confidence thresholds, calibration, hysteresis, and smoothing. Elbow landmarks are deliberately ignored.

Three.js applies the resulting shoulder, head, and torso rotations to the five-bone `shoulder_flap` rig and updates both the main skinned surfaces and their outline meshes.

## Rig Contract

The committed asset is `public/models/psyduck_rigged.glb`. Its skeleton contains exactly `root`, `torso`, `head`, `leftArm`, and `rightArm`. Each arm bone sits at a shoulder and drives an entire flipper. The asset metadata records the motion model, rig version, bind values, and flipper shape; the loader rejects stale or incompatible exports.

No elbow, forearm, wrist, pelvis, leg, knee, ankle, or foot bones belong to this contract. Hold-head is a bounded shoulder pose, not arbitrary contact IK.

## Assets and Pages

`scripts/prepare-assets.mjs` verifies the installed MediaPipe package version, exact WASM sizes and hashes, and the model size and SHA-256 from `asset-manifest.json`. It copies runtime, model, and legal files into ignored `public/` directories. Vite then emits them with the application under `/psyduck-demo/`.

Asset URLs use `import.meta.env.BASE_URL` and `location.origin`; source code does not depend on a private host or CDN at runtime. Pages serves immutable static output, while the browser remains responsible for camera permission and local processing.

## Lifecycle and Failure Handling

Each start invalidates the previous generation. Stop first invalidates the active session, then cancels scheduling, closes owned frames, stops media tracks, terminates the Worker, pauses the video, and clears its source. Late streams close themselves, and messages from stale session IDs cannot update state.

Initialization and frame processing have separate timeouts. Permission, device, model, capture, Worker, and track-end failures converge on cleanup and a visible status while presets remain usable. Page hiding also stops tracking.

## Verification

Node tests cover asset integrity, session races, one-frame backpressure, cleanup, retargeting, five-bone deformation, and silhouettes. Browser tests mount the built `/psyduck-demo/` subpath in Chrome, exercise the real CPU Worker with empty and 33-landmark inputs, inspect the reloaded rig, simulate camera and failure paths, and reject external or non-GET requests.

The clean-build test copies only Git candidate files into a fresh directory, installs dependencies, prepares assets, builds, runs Node and browser tests, and verifies the emitted model, WASM, GLB, and legal files.
