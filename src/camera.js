export class CameraController {
  constructor({ video, assets, onState, onResult, getUserMedia = c => navigator.mediaDevices.getUserMedia(c),
    makeWorker = () => new Worker(new URL('./generated/pose-worker.js', import.meta.url)),
    bitmap = v => createImageBitmap(v), clock = () => performance.now(), schedule = f => setTimeout(f, 50), unschedule = id => clearTimeout(id),
    // Initial loading includes large WASM/model downloads over remote connections.
    initTimeout = 300000, frameTimeout = 10000 }) {
    Object.assign(this, { video, assets, onState, onResult, getUserMedia, makeWorker, bitmap, clock, schedule, unschedule, initTimeout, frameTimeout });
    this.generation = 0; this.session = null;
  }
  state(name, detail) { this.onState?.(name, detail); }
  stop(state = 'stopped') {
    ++this.generation;
    const s = this.session; this.session = null;
    if (s) {
      this.unschedule(s.timer); clearTimeout(s.watchdog); s.cancel?.();
      s.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
      s.worker?.terminate(); s.frame?.close(); s.frame = null;
    }
    this.video.pause(); this.video.srcObject = null;
    this.state(state);
  }
  async start() {
    this.stop('cameraOff');
    const s = { id: this.generation, busy: false, lastTimestamp: -1, lastVideoTime: -1 };
    this.session = s;
    const current = () => this.session === s && this.generation === s.id;
    try {
      this.state('requestingPermission');
      const stream = await this.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } });
      if (!current()) { stream.getTracks().forEach(t => t.stop()); return; }
      s.stream = stream;
      stream.getVideoTracks().forEach(t => { t.onended = () => { if (current()) this.stop('cameraInterrupted'); }; });
      this.video.srcObject = stream;
      await this.video.play();
      if (!current()) return;
      this.state('loadingResources');
      // makeWorker can be async in tests; late workers own only their cleanup.
      const worker = await this.makeWorker();
      if (!current()) { worker.terminate(); return; }
      s.worker = worker;
      const ready = await new Promise((resolve, reject) => {
        s.cancel = () => resolve(false);
        s.watchdog = setTimeout(() => reject(new Error('resourceTimeout')), this.initTimeout);
        worker.onerror = e => { e.preventDefault?.(); reject(new Error('modelLoadFailed')); };
        worker.onmessage = ({ data }) => {
          if (!current() || data.id !== s.id) return;
          if (data.type === 'ready') resolve(true);
          if (data.type === 'error') reject(new Error('modelLoadFailed'));
        };
        worker.postMessage({ type: 'init', id: s.id, assets: this.assets });
      });
      clearTimeout(s.watchdog); s.cancel = null;
      if (!current() || !ready) return;
      worker.onerror = e => { e.preventDefault?.(); if (current()) this.stop('modelLoadFailed'); };
      worker.onmessage = ({ data }) => {
        if (!current() || data.id !== s.id) return;
        if (data.type === 'error') { this.stop('modelLoadFailed'); return; }
        if (data.type !== 'result' || !s.busy || data.timestamp !== s.sentTimestamp) return;
        try {
          if (data.timestamp > s.lastTimestamp) { s.lastTimestamp = data.timestamp; this.onResult?.(data); }
        } catch (error) { this.stop('modelLoadFailed'); }
        finally {
          clearTimeout(s.watchdog); s.frame?.close(); s.frame = null; s.busy = false;
          if (current()) s.timer = this.schedule(tick);
        }
      };
      const tick = async () => {
        if (!current() || s.busy) return;
        if (this.video.readyState < 2 || this.video.currentTime === s.lastVideoTime) { s.timer = this.schedule(tick); return; }
        s.busy = true; s.lastVideoTime = this.video.currentTime;
        // Busy includes capture, transfer, inference, and result consumption.
        s.watchdog = setTimeout(() => { if (current()) this.stop('resourceTimeout'); }, this.frameTimeout);
        let frame;
        try {
          frame = await this.bitmap(this.video);
          if (!current()) { frame.close(); return; }
          s.frame = frame; s.sentTimestamp = Math.max(this.clock(), s.lastTimestamp + 0.001);
          worker.postMessage({ type: 'frame', id: s.id, timestamp: s.sentTimestamp, frame }, [frame]);
          // Worker now owns the transferable; its finally closes the frame.
          s.frame = null;
        } catch (error) { frame?.close(); if (current()) this.stop('modelLoadFailed'); }
      };
      this.state('calibrating'); s.timer = this.schedule(tick);
    } catch (error) {
      if (!current()) return;
      const code = { NotAllowedError: 'permissionDenied', NotFoundError: 'noCamera', NotReadableError: 'deviceBusy' }[error.name]
        || (['resourceTimeout', 'modelLoadFailed'].includes(error.message) ? error.message : 'browserUnsupported');
      this.stop(code);
    }
  }
}
