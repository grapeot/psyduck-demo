import { neutral, clamp, holdAngles, armBind } from './rig.js';

const good = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0)
  && Number.isFinite(p.visibility ?? 1) && Number.isFinite(p.presence ?? 1) && (p.visibility ?? 1) >= 0.55 && (p.presence ?? 1) >= 0.55;
// Unmirrored detector labels: 11/13/15 anatomical LEFT is image RIGHT for
// a frontal person. Mirrored preview maps it to screen LEFT / leftArm (-X).
export const sideContract = { mirror: { 11: 'left', 12: 'right' }, plain: { 11: 'right', 12: 'left' } };

export class Retarget {
  constructor() { this.reset(); }
  reset() {
    this.output = neutral(); this.target = neutral(); this.lastTime = null;
    this.validMs = 0; this.calibrated = false; this.baseline = 0; this.baselineSum = 0;
    this.channels = Object.fromEntries(['left', 'right', 'head', 'torso'].map(k => [k, { last: -Infinity, since: null, contact: false, dwell: 0 }]));
    this.status = 'calibrating';
  }
  update(points, width, height, time, mirror = true) {
    if (!Number.isFinite(time) || (this.lastTime !== null && time <= this.lastTime)) return this.output;
    const dt = this.lastTime === null ? 0 : Math.min(100, time - this.lastTime);
    const contiguous = this.lastTime !== null && time - this.lastTime <= 250;
    this.lastTime = time;
    const aspect = Number.isFinite(width / height) && width > 0 && height > 0 ? width / height : 0;
    const p = points || [];
    const point = i => good(p[i]) && aspect ? { x: p[i].x * aspect, y: p[i].y } : null;
    const a = point(11), b = point(12), nose = point(0);
    const shoulderWidth = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    const shoulders = shoulderWidth > 0.015;
    const imageSlope = shoulders ? Math.atan2(a.y - b.y, Math.abs(a.x - b.x)) : 0;
    const slope = imageSlope * (mirror ? 1 : -1);
    const allValid = shoulders && nose && [11, 12].every(i => {
      const s = point(i), w = point(i + 4);
      return s && w && Math.hypot(w.x - s.x, w.y - s.y) >= 0.005;
    });
    if (!this.calibrated) {
      if (allValid && contiguous) { this.validMs += dt; this.baselineSum += slope * dt; }
      else { this.validMs = 0; this.baselineSum = 0; }
      if (this.validMs >= 2000) { this.calibrated = true; this.baseline = this.baselineSum / this.validMs; }
    }
    this.status = !shoulders ? 'personNotFound' : !this.calibrated ? 'calibrating' : 'following';
    const refresh = (key, valid, update) => {
      const channel = this.channels[key];
      if (valid) {
        if (channel.since === null) channel.since = time;
        channel.last = time;
        // Confirm re-entry for 100 ms; never replace smoothed output directly.
        if (time - channel.since >= 100) update(channel);
      } else {
        channel.since = null; channel.dwell = 0;
        if (time - channel.last > 450) {
          this.target[key] = neutral()[key];
          if (key === 'left' || key === 'right') channel.contact = false;
          if (key === 'head') this.target.nod = 0;
        }
      }
    };
    // The shoulder_flap model deliberately ignores detector elbow landmarks.
    for (const [s, w] of [[11, 15], [12, 16]]) {
      const side = sideContract[mirror ? 'mirror' : 'plain'][s], wrist = point(w), shoulder = point(s);
      const outward = s === 11 ? 1 : -1;
      const validLimb = shoulders && shoulder && wrist
        && Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y) >= 0.005;
      refresh(side, validLimb, channel => {
        const vx = wrist.x - shoulder.x, vy = wrist.y - shoulder.y;
        const dx = (Math.cos(imageSlope) * vx + Math.sin(imageSlope) * vy) * outward;
        const dy = -Math.sin(imageSlope) * vx + Math.cos(imageSlope) * vy;
        const distance = nose ? Math.hypot(wrist.x - nose.x, wrist.y - nose.y) / shoulderWidth : Infinity;
        const switching = channel.contact ? distance > 0.85 : distance < 0.58;
        channel.dwell = switching ? channel.dwell + dt : 0;
        if (channel.dwell >= (channel.contact ? 260 : 300)) { channel.contact = !channel.contact; channel.dwell = 0; }
        const angle = clamp(Math.atan2(Math.max(0, dx), dy), armBind.minAngle, armBind.maxAngle);
        this.target[side] = channel.contact ? holdAngles[side] : angle;
      });
    }
    refresh('torso', shoulders, () => { this.target.torso = clamp(slope - this.baseline, -0.13, 0.13); });
    const eyeA = point(2), eyeB = point(5);
    refresh('head', shoulders && nose && eyeA && eyeB && Math.abs(eyeA.x - eyeB.x) > 0.005, () => {
      this.target.head = clamp(Math.atan2(eyeA.y - eyeB.y, Math.abs(eyeA.x - eyeB.x)) * (mirror ? 1 : -1) - slope, -0.25, 0.25);
      this.target.nod = 0;
    });
    const alpha = 1 - Math.exp(-dt / 160);
    for (const key of Object.keys(this.output)) this.output[key] += (this.target[key] - this.output[key]) * alpha;
    return { ...this.output };
  }
}
