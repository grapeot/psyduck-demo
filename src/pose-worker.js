import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let detector, session;
self.onmessage = async ({ data }) => {
  const { type, id, timestamp, frame } = data;
  try {
    if (type === 'init') {
      session = id;
      const fileset = await FilesetResolver.forVisionTasks(data.assets.wasm);
      detector = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.assets.model, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'ready', id });
    } else if (type === 'frame' && session === id && detector) {
      const result = detector.detectForVideo(frame, timestamp);
      self.postMessage({ type: 'result', id, timestamp, landmarks: result.landmarks[0] || [], width: frame.width, height: frame.height });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, message: String(error.message || error) });
  } finally { frame?.close(); }
};
