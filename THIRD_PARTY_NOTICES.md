# Third-Party Notices

This project bundles or redistributes the following third-party components. The Apache License, Version 2.0 is provided at [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt).

## Three.js

- Component: Three.js JavaScript 3D library
- Version: 0.180.0
- License: MIT
- Source: https://github.com/mrdoob/three.js
- Distribution: bundled in the built site

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## MediaPipe Tasks Vision runtime

- Component: `@mediapipe/tasks-vision` JavaScript glue and WebAssembly runtime
- Version: 0.10.22-rc.20250304
- Copyright: The MediaPipe Authors
- License: Apache-2.0
- Source: https://github.com/google-ai-edge/mediapipe
- Distribution: copied from the pinned npm package into the built site

## Pose Landmarker Lite model bundle

- Component: MediaPipe Pose Landmarker Lite, BlazePose GHUM 3D, float16
- Bundle version: 1
- File: `pose_landmarker_lite.task`
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- Authors listed by the model card: Valentin Bazarevsky, Ivan Grishchenko, and Eduard Gabriel Bazavan, Google
- License: Apache-2.0, as identified by the official BlazePose GHUM 3D model card
- Model source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- Distribution: copied after size and SHA-256 verification into the built site

## Character rights and trademarks

This repository is an unofficial fan and technical reference implementation. It is not affiliated with, endorsed by, or sponsored by Nintendo, The Pokémon Company, Game Freak, or their affiliates.

Pokémon, Psyduck, and related character names, designs, likenesses, and trademarks belong to their respective owners. The repository's MIT license applies only to original project code. It grants no license to third-party characters, names, trademarks, artwork, models, or other third-party material. Publishing this reference asset does not grant third-party character rights or permission to redistribute it.
