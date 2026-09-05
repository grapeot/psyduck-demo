import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Retarget } from '../src/retarget.js';
import { neutral, templeAngles } from '../src/rig.js';

function person() {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0, presence: 1 }));
  const set = (i, x, y) => { p[i] = { x, y, visibility: 1, presence: 1 }; };
  set(0, 0.5, 0.22); set(2, 0.54, 0.19); set(5, 0.46, 0.19);
  set(11, 0.65, 0.4); set(12, 0.35, 0.4);
  set(13, 0.68, 0.6); set(14, 0.32, 0.6); set(15, 0.68, 0.8); set(16, 0.32, 0.8);
  return p;
}
function run(r, p, from = 0, to = 2500, mirror = true, w = 640, h = 480) {
  for (let t = from; t <= to; t += 50) r.update(p, w, h, t, mirror);
  return r.output;
}
test('left/right anatomical contract and nonmirrored mapping', () => {
  for (const [s, e, w, expected] of [[11, 13, 15, 'left'], [12, 14, 16, 'right']]) {
    const p = person(); p[e].y = 0.23; p[w].y = 0.08;
    const r = new Retarget(); run(r, p);
    assert.ok(r.output[expected] > 2.4); assert.ok(r.output[expected === 'left' ? 'right' : 'left'] < 0.5);
    const plain = new Retarget(); run(plain, p, 0, 2500, false);
    assert.ok(plain.output[expected === 'left' ? 'right' : 'left'] > 2.4);
  }
});
test('spread, aspect-correct directions and no hip dependency', () => {
  const p = person();
  for (const i of [13, 14, 15, 16]) p[i].y = 0.4;
  p[13].x = 0.8; p[15].x = 1; p[14].x = 0.2; p[16].x = 0;
  const r = new Retarget(); run(r, p);
  assert.ok(Math.abs(r.output.left - Math.PI / 2) < 0.01); assert.ok(r.calibrated);
  const q = person(); const a = new Retarget(), b = new Retarget();
  const rescaled = q.map(p => ({ ...p, x: p.x / 2 }));
  run(a, q, 0, 2500, true, 640, 480); run(b, rescaled, 0, 2500, true, 1280, 480);
  assert.ok(Math.abs(a.output.left - b.output.left) < 1e-6);
});
test('hold-head entry dwell, hysteresis and exit dwell', () => {
  const p = person(), r = new Retarget(); run(r, p);
  p[15] = { ...p[15], x: 0.59, y: 0.24 };
  run(r, p, 2550, 2700); assert.equal(r.channels.left.contact, false);
  run(r, p, 2750, 3100); assert.equal(r.channels.left.contact, true);
  assert.ok(Math.abs(r.target.left - templeAngles()[0]) < 1e-6);
  p[15].x = 0.71; run(r, p, 3150, 3600); assert.equal(r.channels.left.contact, true);
  p[15].x = 0.9; run(r, p, 3650, 3750); assert.equal(r.channels.left.contact, true);
  run(r, p, 3800, 4100); assert.equal(r.channels.left.contact, false);
});
test('single wrist/elbow occlusion does not invalidate other side', () => {
  for (const i of [13, 15]) {
    const p = person(), r = new Retarget(); p[14].y = 0.2; p[16].y = 0.03; run(r, p);
    p[i].visibility = 0; run(r, p, 2550, 3500);
    assert.ok(r.output.right > 2.4); assert.ok(Math.abs(r.output.left - neutral().left) < 0.02);
  }
});
test('loss holds briefly then returns idle; reentry is confirmed and smooth', () => {
  const p = person(), r = new Retarget(); p[13].y = 0.2; p[15].y = 0.02; run(r, p);
  const before = r.output.left; run(r, [], 2550, 2750); assert.ok(Math.abs(r.output.left - before) < 0.01);
  run(r, [], 2800, 4500); assert.ok(r.output.left < 0.25);
  r.update(p, 640, 480, 4550); assert.ok(r.output.left < 0.25);
  run(r, p, 4600, 5500); assert.ok(r.output.left > 2.4);
});
test('zero shoulder width, NaN and invalid dimensions stay finite; stale timestamps ignored', () => {
  for (const mutation of [p => { p[11] = { ...p[12] }; }, p => { p[13].x = NaN; }, p => { p[0].y = Infinity; }, p => { p[15] = { ...p[13] }; }, p => { p[15].visibility = Infinity; }]) {
    const r = new Retarget(), p = person(); mutation(p); run(r, p);
    assert.ok(Object.values(r.output).every(Number.isFinite)); assert.equal(r.calibrated, false);
    const before = { ...r.output }; r.update(person(), 640, 480, 10); assert.deepEqual(r.output, before);
  }
  const r = new Retarget(); run(r, person(), 0, 2500, true, 0, 0); assert.equal(r.calibrated, false);
});
test('calibration requires continuous valid samples, reset and time gaps restart accumulation', () => {
  const r = new Retarget(), p = person(); run(r, p, 0, 1500); assert.equal(r.calibrated, false);
  r.update([], 640, 480, 1550); assert.equal(r.validMs, 0);
  run(r, p, 1600, 2500); r.update(p, 640, 480, 4000); assert.equal(r.validMs, 0);
  run(r, p, 4050, 6100); assert.equal(r.calibrated, true);
  r.reset(); assert.equal(r.validMs, 0); assert.equal(r.calibrated, false); assert.deepEqual(r.output, neutral());
});
test('head tilt is confidence-gated and does not change feet/root controls', () => {
  const r = new Retarget(), p = person(); p[2].y += 0.04; run(r, p);
  assert.ok(r.output.head > 0.15);
  p[2].visibility = 0; run(r, p, 2550, 4000); assert.ok(Math.abs(r.output.head) < 0.01);
  assert.deepEqual(Object.keys(r.output).sort(), Object.keys(neutral()).sort());
});
test('shoulder-local arm directions are invariant to image-plane torso roll', () => {
  const p = person(), angle = 0.12, aspect = 640 / 480;
  const rotated = p.map(p => {
    const x = (p.x - 0.5) * aspect, y = p.y - 0.4;
    return { ...p, x: 0.5 + (x * Math.cos(angle) - y * Math.sin(angle)) / aspect, y: 0.4 + x * Math.sin(angle) + y * Math.cos(angle) };
  });
  const a = new Retarget(), b = new Retarget(); run(a, p); run(b, rotated);
  assert.ok(Math.abs(a.output.left - b.output.left) < 1e-6);
  assert.ok(Math.abs(a.output.right - b.output.right) < 1e-6);
});
test('temple IK preserves fixed link lengths, joint limits and head clearance', () => {
  const [a, b] = templeAngles();
  assert.ok(a > 0.12 && a < 2.9 && b >= 0 && b <= 1.1);
  const x = 0.9 + 0.52 * Math.sin(a) + 0.56 * Math.sin(a + b);
  const y = 1.7 - 0.52 * Math.cos(a) - 0.56 * Math.cos(a + b);
  assert.ok(Math.abs(x - 0.8) < 1e-6 && Math.abs(y - 2.66) < 1e-6);
  assert.ok(x * x + ((y - 2.22) / 0.73) ** 2 + ((0.4 - 0.05) / 0.71) ** 2 > 1.12);
});
