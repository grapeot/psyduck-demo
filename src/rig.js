import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const neutral = () => ({ left: 0.22, right: 0.22, leftBend: 0, rightBend: 0, head: 0, nod: 0, torso: 0 });
// Character faces +Z, screen right is +X. Both flippers rest along -Y.
// Local +Z rotation raises screen-right flipper; screen-left uses the negative.
export function templeAngles() {
  // Conservative head ellipsoid at the fixed flipper depth. Keep the contact
  // target outside it, then project onto the two-link reachable annulus.
  const targetY = 2.66, targetZ = 0.40;
  const safeX = Math.sqrt(Math.max(0, 1.12 - ((targetY - 2.22) / 0.73) ** 2 - ((targetZ - 0.05) / 0.71) ** 2));
  const a = 0.52, b = 0.56, x = Math.max(0.80, safeX) - 0.90, y = targetY - 1.70;
  const distance = clamp(Math.hypot(x, y), Math.abs(a - b) + 0.01, a + b - 0.01);
  const bend = Math.acos(clamp((distance * distance - a * a - b * b) / (2 * a * b), -1, 1));
  return [Math.PI - Math.atan2(x, y) - Math.atan2(b * Math.sin(bend), a + b * Math.cos(bend)), bend];
}
export function preset(name, time = 0) {
  const p = neutral();
  if (name === 'raiseOneArm') p.right = 2.65;
  if (name === 'armsSpread') p.left = p.right = Math.PI / 2;
  if (name === 'holdHead') {
    [p.left, p.leftBend] = templeAngles();
    p.right = p.left; p.rightBend = p.leftBend;
  }
  if (name === 'headTilt') p.head = 0.24;
  if (name === 'bodySway') p.torso = Math.sin(time * 1.7) * 0.12;
  if (name === 'idle') p.nod = Math.sin(time * 1.4) * 0.018;
  return p;
}
export function applyPose(root, pose) {
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    root.getObjectByName(`${side}Arm`).rotation.z = sign * clamp(pose[side] || 0, 0.12, 2.9);
    root.getObjectByName(`${side}Elbow`).rotation.z = sign * clamp(pose[`${side}Bend`] || 0, 0, 1.1);
  }
  root.getObjectByName('head').rotation.set(clamp(pose.nod || 0, -0.12, 0.12), 0, clamp(pose.head || 0, -0.25, 0.25));
  root.getObjectByName('torso').rotation.z = clamp(pose.torso || 0, -0.13, 0.13);
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
}

export function buildRig(source) {
  const root = new THREE.Group(); root.name = 'PsyduckRig';
  const bones = [];
  function bone(name, parent, position) {
    const b = new THREE.Bone(); b.name = name; b.position.set(...position); parent.add(b); bones.push(b); return b;
  }
  const base = bone('root', root, [0, 0, 0]);
  const torso = bone('torso', base, [0, 0.85, 0]);
  bone('head', torso, [0, 1.08, 0.04]);
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const arm = bone(`${side}Arm`, torso, [sign * 0.90, 0.85, 0.40]);
    bone(`${side}Elbow`, arm, [0, -0.52, 0]);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  function skin(name, geometry, color, weighting) {
    const indices = [], weights = [], p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [a, b, w] = weighting(p.getX(i), p.getY(i), p.getZ(i));
      indices.push(a, b, 0, 0); weights.push(1 - w, w, 0, 0);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh); mesh.bind(skeleton); mesh.frustumCulled = false;
  }
  source.updateMatrixWorld(true);
  source.traverse(o => {
    if (!o.isMesh || /flipper/i.test(o.name)) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const body = /Pear/.test(o.name), foot = /foot|fold/i.test(o.name);
    skin(o.name, geometry, o.material.color, (_, y) => {
      if (foot) return [0, 0, 0];
      if (!body) return [2, 2, 0];
      if (y < 1.5) return [0, 1, THREE.MathUtils.smoothstep(y, 0.35, 1.35)];
      return [1, 2, THREE.MathUtils.smoothstep(y, 1.55, 2.1)];
    });
  });
  for (const [side, sign, index] of [['left', -1, 3], ['right', 1, 5]]) {
    const positions = [], triangles = [], rings = 36, segments = 20;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, radius = Math.sin(Math.PI * t) ** 0.55 * (0.245 - 0.08 * t);
      for (let j = 0; j <= segments; j++) {
        const a = j / segments * 2 * Math.PI;
        positions.push(sign * 0.90 + Math.cos(a) * radius, 1.82 - t * 1.2, 0.40 + Math.sin(a) * radius * 0.55);
        if (i < rings && j < segments) {
          const k = i * (segments + 1) + j;
          triangles.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(triangles); geometry.computeVertexNormals();
    skin(`${side}Flipper`, geometry, '#e8c574', (_, y) => [index, index + 1, THREE.MathUtils.smoothstep(1.7 - y, 0.32, 0.73)]);
  }
  return root;
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
