# Character Motion Reference

## Goal and Boundaries

Produce a reloadable stylized character whose appearance remains coherent across useful views, whose two whole flippers deform from shoulder joints, and whose optional browser tracking is local, bounded, and safe to stop.

The target rig contains exactly `root`, `torso`, `head`, `leftArm`, and `rightArm`. It has no elbow, wrist, hand, pelvis, leg, or foot bones. Do not infer or promise lower-body, detailed-hand, or facial-expression behavior. Camera inference stays in a CPU WebAssembly Worker; presets are the fallback, not main-thread inference or a backend.

Public releases may include only authorized source and assets. Exclude private camera media, local references, screenshots, generated reports, private hosts, and credentials. The MIT license covers original code only and does not grant rights to the third-party character or other third-party material.

## Acceptance Criteria

- Real renders, not readiness flags alone, show recognizable proportions and coherent front, side, back, and three-quarter volumes.
- The exported and reloaded GLB has the exact five-bone hierarchy, current motion metadata, finite geometry, normalized weights, and connected shoulder cross-sections.
- Raising either shoulder moves one continuous whole flipper. Resting and minimum poses do not create an elbow-like contour, and required hold-head poses remain outside the head surface.
- Main surfaces, outlines, normals, and shadows follow the same skinning deformation.
- Presets and actual Worker results drive the same rig path. Retargeting uses shoulder-to-wrist direction and ignores elbow landmarks.
- Camera start is explicit and requests `audio: false`; stop, cancellation, timeout, failure, track end, and page hiding release owned frames, tracks, and Worker state.
- A built `/psyduck-demo/` site loads its GLB, Worker, WASM, task model, and legal files from the expected same-origin paths. Browser evidence observes no external or non-GET request during actual inference.

## Adaptable Methods

Treat silhouette, feature proportions, volume, pose, material, and rendering as separate error layers. Compare actual renders against permitted references with proportional alignment; do not use non-uniform image stretching or camera changes to hide geometry errors. Recheck other views after a local shape change. Public availability of a reference does not imply permission to redistribute it.

Keep appearance generation and rig generation reproducible, but judge the serialized asset after reload rather than trusting the in-memory scene. Preserve source parameters and embed enough bind and shape metadata for the runtime to reject stale exports.

Use transferable `ImageBitmap` frames with one-frame backpressure. Tag initialization, frames, and results with a tracking-session generation and monotonic timestamps so late work can be discarded. Retarget motion intent into bounded character poses instead of stretching the character toward human coordinates.

Automated checks can inspect topology, metadata, weights, deformation, resource paths, network requests, and synthetic inference. They do not prove subjective likeness, real-camera feel, every browser, or every device; report those gaps rather than converting them into unsupported claims.

## Known Failure Traps

**Disconnected shoulder skinning.** A nominal arm bone can move while a zero-weight boundary tears the flipper from the torso. Inspect connected geometry and blended weights after GLB reload at extreme poses.

**Elbow-like silhouette without an elbow bone.** A curved centerline or tip reversal can visually recreate the joint the rig intentionally removed. Sample the whole-flipper centerline and inspect real minimum, neutral, spread, and hold renders.

**Stale GLB metadata.** Changing bind or shape parameters without rebuilding leaves a valid-looking but incompatible binary. Compare serialized metadata with current constants and reject mismatches at load time.

**Large binary serialization timeout.** Converting a large GLB or frame buffer into JSON-like arrays can dominate transfer time. Keep GLB export binary and transfer `ImageBitmap` ownership rather than cloning pixel arrays.

**Empty WebGL output despite ready state.** A loaded asset, resolved promise, or ready flag does not prove pixels were rendered. Capture and inspect the canvas, and use pixel or silhouette evidence where automation must detect blank output.

**Worker cancellation races and late frames.** Permission, Worker creation, frame capture, and inference can finish after stop. Invalidate the generation before cleanup, close late resources, and accept only the current session and timestamp.

**Pages subpath and prepared resources.** Root-relative URLs can pass locally and fail under `/psyduck-demo/`; ignored WASM and task files can also disappear from a clean build. Build from Git candidate files, prepare pinned assets, mount the actual subpath, and verify each emitted resource and legal file.
