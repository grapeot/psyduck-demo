import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Slightly higher shoulder and a longer forearm give a high hand target room
// to fold. The 80-degree elbow limit supports that return, not bone stretching.
export const armBind = Object.freeze({ x: 0.70, y: 1.80, z: 0.50, upper: 0.46, lower: 0.68, restAngle: Math.PI / 2, maxElbow: 1.40 });
export const flipperShape = Object.freeze({ rootRadius: 0.24, elbowRadius: 0.22, tipRadius: 0.10, tipSweep: 0, elbowOffset: -0.10, depthScale: 0.62, elbowBlendBefore: 0.17, elbowBlendAfter: 0.26, palmLength: 0.24, palmHalfWidth: 0.17, palmDepthScale: 0.35, lobeHeight: 0.026, edgeRound: 0.045, rimRound: 0.014 });
export const holdHeadTargets = Object.freeze({
  left: Object.freeze({ x: 0.88, y: 2.75, z: armBind.z }),
  right: Object.freeze({ x: 0.94, y: 2.66, z: armBind.z }),
});
export const neutral = () => ({ left: 0.22, right: 0.22, leftBend: 0, rightBend: 0, head: 0, nod: 0, torso: 0 });
// Character faces +Z, screen right is +X. Open T-pose bind rotations are
// baked into the inverse binds; pose angles remain absolute from local -Y.
// Local +Z rotation raises screen-right flipper; screen-left uses the negative.
export function templeAngles(side = 'left') {
  // Conservative head ellipsoid at the fixed flipper depth. Keep the contact
  // target outside it, then project onto the two-link reachable annulus.
  const { x: targetX, y: targetY, z: targetZ } = holdHeadTargets[side];
  const safeX = Math.sqrt(Math.max(0, 1.12 - ((targetY - 2.22) / 0.73) ** 2 - ((targetZ - 0.05) / 0.71) ** 2));
  const a = armBind.upper, b = armBind.lower, x = Math.max(targetX, safeX) - armBind.x, y = targetY - armBind.y;
  const distance = clamp(Math.hypot(x, y), Math.abs(a - b) + 0.01, a + b - 0.01);
  const bend = Math.acos(clamp((distance * distance - a * a - b * b) / (2 * a * b), -1, 1));
  return [Math.PI - Math.atan2(x, y) - Math.atan2(b * Math.sin(bend), a + b * Math.cos(bend)), bend];
}
export function preset(name, time = 0) {
  const p = neutral();
  if (name === 'raiseOneArm') { p.right = 1.15; p.rightBend = 1.40; }
  if (name === 'armsSpread') p.left = p.right = Math.PI / 2;
  if (name === 'holdHead') {
    [p.left, p.leftBend] = templeAngles('left');
    [p.right, p.rightBend] = templeAngles('right');
  }
  if (name === 'headTilt') p.head = 0.24;
  if (name === 'bodySway') p.torso = Math.sin(time * 1.7) * 0.12;
  if (name === 'idle') p.nod = Math.sin(time * 1.4) * 0.018;
  return p;
}
export function applyPose(root, pose) {
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    root.getObjectByName(`${side}Arm`).rotation.z = sign * clamp(pose[side] || 0, 0.12, 2.9);
    root.getObjectByName(`${side}Elbow`).rotation.z = sign * clamp(pose[`${side}Bend`] || 0, 0, armBind.maxElbow);
  }
  root.getObjectByName('head').rotation.set(clamp(pose.nod || 0, -0.12, 0.12), 0, clamp(pose.head || 0, -0.25, 0.25));
  root.getObjectByName('torso').rotation.z = clamp(pose.torso || 0, -0.13, 0.13);
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
}

// Built-in materials supply skinning for normals and depth/shadow passes. Hull
// expansion happens in bind space, then uses exactly the same skin matrices.
export function addOutlines(root) {
  const surfaces = [];
  root.traverse(o => { if (o.isSkinnedMesh) surfaces.push(o); });
  for (const mesh of surfaces) {
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    const original = mesh.material;
    mesh.material = new THREE.MeshStandardMaterial({ color: original.color, roughness: 1 });
    if (/eye|pupil|contour|slit|fold/i.test(mesh.name)) continue;
    const geometry = mesh.geometry.clone(), p = geometry.attributes.position, n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.007, p.getY(i) + n.getY(i) * 0.007, p.getZ(i) + n.getZ(i) * 0.007);
    const outline = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ color: '#584337', side: THREE.BackSide }));
    outline.name = `${mesh.name}_outline`; outline.frustumCulled = false;
    mesh.parent.add(outline); outline.bind(mesh.skeleton, mesh.bindMatrix); outline.userData.outline = true;
  }
}
