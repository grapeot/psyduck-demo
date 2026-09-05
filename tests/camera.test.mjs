import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraController } from '../src/camera.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(r => setImmediate(r));
function harness(options = {}) {
  const track = { stopped: 0, stop() { this.stopped++; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = { play: async () => {}, pause() {}, readyState: 2, currentTime: 1, srcObject: null };
  const worker = { terminated: 0, messages: [], terminate() { this.terminated++; }, postMessage(m) { this.messages.push(m); if (m.type === 'init') queueMicrotask(() => this.onmessage({ data: { type: 'ready', id: m.id } })); } };
  const states = [], results = [], queue = [];
  const controller = new CameraController({ video, assets: {}, getUserMedia: async () => stream, makeWorker: () => worker,
    bitmap: async () => ({ close() {} }), onState: s => states.push(s), onResult: r => results.push(r), schedule: f => { queue.push(f); return f; }, unschedule: f => { const i = queue.indexOf(f); if (i >= 0) queue.splice(i, 1); }, ...options });
  return { controller, video, worker, stream, track, states, results, queue };
}
test('permission arriving after stop closes stream without worker activation', async () => {
  const d = deferred(), h = harness({ getUserMedia: () => d.promise });
  const starting = h.controller.start(); h.controller.stop(); d.resolve(h.stream); await starting;
  assert.equal(h.track.stopped, 1); assert.equal(h.worker.messages.length, 0); assert.equal(h.video.srcObject, null);
});
test('late worker closes itself after cancellation', async () => {
  const d = deferred(), h = harness({ makeWorker: () => d.promise });
  const starting = h.controller.start(); await flush(); h.controller.stop(); d.resolve(h.worker); await starting;
  assert.equal(h.worker.terminated, 1); assert.equal(h.track.stopped, 1); assert.equal(h.queue.length, 0);
});
test('stop-restart ignores old results and old permission', async () => {
  const d = deferred(), h = harness(); let requests = 0;
  h.controller.getUserMedia = () => ++requests === 1 ? d.promise : Promise.resolve(h.stream);
  const old = h.controller.start(); await h.controller.start(); const id = h.controller.session.id;
  h.worker.onmessage({ data: { type: 'result', id: id - 2, timestamp: 2 } }); assert.equal(h.results.length, 0);
  const oldTrack = { stop: () => requests++ }; d.resolve({ getTracks: () => [oldTrack] }); await old;
  assert.equal(h.controller.session.id, id); assert.equal(requests, 3); h.controller.stop();
});
test('capture through consumption is max one frame and late bitmap closes', async () => {
  const d = deferred(); let captures = 0, closed = 0;
  const h = harness({ bitmap: () => { captures++; return d.promise; } }); await h.controller.start();
  const tick = h.queue.shift(); const capture = tick(); await tick(); await tick(); assert.equal(captures, 1);
  h.controller.stop(); d.resolve({ close: () => closed++ }); await capture;
  assert.equal(closed, 1); assert.equal(h.worker.messages.filter(m => m.type === 'frame').length, 0);
});
test('matching result consumes once; old timestamps cannot unlock pending frame', async () => {
  const h = harness(); await h.controller.start(); const tick = h.queue.shift(); await tick();
  const sent = h.worker.messages.at(-1); assert.equal(sent.type, 'frame');
  h.worker.onmessage({ data: { type: 'result', id: sent.id, timestamp: sent.timestamp - 1 } }); assert.equal(h.controller.session.busy, true);
  const reply = { data: { type: 'result', id: sent.id, timestamp: sent.timestamp } };
  h.worker.onmessage(reply); h.worker.onmessage(reply); assert.equal(h.results.length, 1); assert.equal(h.queue.length, 1);
  h.controller.stop(); assert.equal(h.queue.length, 0); assert.equal(h.worker.terminated, 1);
});
test('worker failure, timeout and local track end release resources', async () => {
  const h = harness(); await h.controller.start(); h.worker.onerror({ preventDefault() {} });
  assert.equal(h.states.at(-1), 'modelLoadFailed'); assert.equal(h.track.stopped, 1);
  const j = harness(); await j.controller.start(); j.track.onended(); assert.equal(j.states.at(-1), 'cameraInterrupted');
  const k = harness({ initTimeout: 5 }); k.worker.postMessage = () => {}; await k.controller.start();
  assert.equal(k.states.at(-1), 'resourceTimeout'); assert.equal(k.worker.terminated, 1);
});
test('cancel during initialization resolves start and rejects late ready', async () => {
  const h = harness(); h.worker.postMessage = m => h.worker.messages.push(m);
  const starting = h.controller.start(); await flush(); const init = h.worker.messages[0]; h.controller.stop(); await starting;
  h.worker.onmessage({ data: { type: 'ready', id: init.id } }); assert.equal(h.queue.length, 0); assert.equal(h.states.at(-1), 'stopped');
});
test('capture failure and inference timeout cannot leave a live track', async () => {
  const h = harness({ bitmap: async () => { throw new Error('capture failure'); } });
  await h.controller.start(); await h.queue.shift()(); assert.equal(h.states.at(-1), 'modelLoadFailed'); assert.equal(h.track.stopped, 1);
  const j = harness({ frameTimeout: 5 }); await j.controller.start(); await j.queue.shift()();
  await new Promise(r => setTimeout(r, 15)); assert.equal(j.states.at(-1), 'resourceTimeout'); assert.equal(j.track.stopped, 1); assert.equal(j.worker.terminated, 1);
});
