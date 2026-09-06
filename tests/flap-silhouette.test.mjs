import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { armBind, flipperCurveAt, flipperShape, neutral } from '../src/rig.js';

test('minimum and neutral flaps descend without an elbow-like front-view reversal', async () => {
  const end = armBind.length - flipperShape.tipRadius;
  const results = {};
  for (const [name, angle] of [['minimum', armBind.minAngle], ['neutral', neutral().right]]) {
    const delta = angle - armBind.restAngle;
    const points = Array.from({ length: 101 }, (_, index) => {
      const t = index / 100;
      const along = end * t;
      const curve = flipperCurveAt(t);
      return {
        t,
        x: armBind.x + along * Math.cos(delta) - curve * Math.sin(delta),
        y: armBind.y + along * Math.sin(delta) + curve * Math.cos(delta),
      };
    });
    let minOutwardStep = Infinity;
    let maxDownwardStep = -Infinity;
    for (let index = 1; index < points.length; index++) {
      minOutwardStep = Math.min(minOutwardStep, points[index].x - points[index - 1].x);
      maxDownwardStep = Math.max(maxDownwardStep, points[index].y - points[index - 1].y);
    }
    results[name] = { angle, minOutwardStep, maxDownwardStep };
    assert.ok(minOutwardStep > 0, `${name} centerline reverses laterally and reads as an elbow`);
    assert.ok(maxDownwardStep < 0, `${name} centerline reverses vertically`);
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/rest-flap-silhouette.json', JSON.stringify(results, null, 2));
});
