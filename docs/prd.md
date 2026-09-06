# Product Requirements: Psyduck Web Motion Reference

**Status:** Implemented scope

## Goals

The project demonstrates an interactive 3D character in a static website. Users can run procedural presets without permissions and may explicitly start local upper-body pose tracking. The implementation keeps camera processing in the browser, makes the rig contract inspectable, and remains deployable under the GitHub Pages `/psyduck-demo/` base path.

## Non-Goals

The current scope excludes backend or cloud inference, storage, analytics, lower-body motion, legs and feet, elbow or wrist bones, detailed hand tracking, facial expression capture, room-scale movement, and main-thread pose inference.

The project does not grant or resolve rights to third-party character names, designs, artwork, or models.

## User Experience

On initial load, the character and preset controls become available without a camera prompt or pose-model download. Users can select six presets or start an automatic sequence.

Camera tracking begins only after an explicit action. The page communicates permission, loading, calibration, following, person-lost, and failure states. Users can stop tracking, recalibrate, mirror the mapping, hide the preview, and show the shoulder-to-wrist skeleton. Hiding the preview does not stop the camera.

If permission, camera, model, Worker, or resource loading fails, the app releases available resources and leaves preset animation usable.

## Privacy Expectations

- Camera capture requires a user action and requests `audio: false`.
- Pose inference runs in a CPU WebAssembly Worker.
- Camera frames and landmarks are not recorded or sent to an application backend.
- Production resources load from the same origin.
- Automated browser verification must reject external or non-GET runtime requests during actual Worker inference.

## Acceptance Criteria

- The reloaded GLB exposes exactly `root`, `torso`, `head`, `leftArm`, and `rightArm` bones and valid `shoulder_flap` metadata.
- Shoulder movement deforms continuous whole flippers without an elbow-like resting silhouette.
- All six presets and auto demo work without camera access.
- Empty and 33-landmark fixture frames traverse the actual CPU Worker path without a physical camera.
- Cancellation, late permission, old Worker results, capture failures, timeouts, and track interruptions release resources safely.
- A clean checkout can install, prepare pinned assets, test, and build for `/psyduck-demo/`.
