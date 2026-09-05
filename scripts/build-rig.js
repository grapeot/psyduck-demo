import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { armBind, flipperShape, clamp } from '../src/rig.js';

const smooth = THREE.MathUtils.smoothstep;
const union = (a, b, k) => Math.min(a, b) - Math.max(k - Math.abs(a - b), 0) ** 2 / (4 * k);
const worldY = y => { const t = clamp((y - 0.07) / 2.23, 0, 1); return (y - 0.12 * t * t * (3 - 2 * t)) * 0.9 + 0.0072; };
function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  x = (x - cx) / rx; y = (y - cy) / ry; z = (z - cz) / rz;
  const k = Math.hypot(x, y, z);
  return k < 1e-6 ? -Math.min(rx, ry, rz) : k * (k - 1) / Math.hypot(x / rx, y / ry, z / rz);
}
// These neutral body/head/tail fields and the y compression are the same
// shape definitions as anime.js, not an import of its live rendering scene.
function bodyField(x, y, z) {
  const width = 1.12 * (1 - (y - 1.2) * 0.07);
  const body = ellipsoid(x, y, z, 0, 1.25, -0.045, width, 1.17, 0.88);
  const cheek = 0.1 * Math.exp(-(((y - 2.13) / 0.30) ** 2));
  const head = ellipsoid(x, y, z, 0, 2.58, 0.05 + cheek, 1 + 0.035 * Math.exp(-(((y - 2.36) / 0.35) ** 2)), 0.81, 0.79);
  const ay = y - 0.60, az = z + 0.90;
  const t = clamp((ay * 0.65 - az * 0.62) / (0.65 ** 2 + 0.62 ** 2), 0, 1);
  const tail = Math.hypot(x * 0.60, ay - 0.65 * t, az + 0.62 * t) - (0.26 - 0.24 * t);
  return union(union(body, head, 0.20), tail, 0.16);
}
const dx = Math.sin(armBind.restAngle), dy = -Math.cos(armBind.restAngle);
function flipperField(x, y, z) {
  x = Math.abs(x) - armBind.x; y -= armBind.y;
  const length = armBind.upper + armBind.lower, end = length - flipperShape.tipRadius;
  const axial = x * dx + y * dy, across = x * -dy + y * dx;
  const along = clamp(axial, -0.12, length + flipperShape.lobeHeight);
  const proximal = smooth(along, -0.12, armBind.upper), distal = smooth(along, armBind.upper, end);
  const baseRadius = along <= armBind.upper
    ? THREE.MathUtils.lerp(flipperShape.rootRadius, flipperShape.elbowRadius, proximal)
    : THREE.MathUtils.lerp(flipperShape.elbowRadius, flipperShape.tipRadius, distal);
  // Bias volume toward the elbow's outside; the inside of the folded blade
  // stays slender instead of collapsing a symmetric thick tube into a crease.
  const palm = smooth(along, length - flipperShape.palmLength, end);
  const radius = THREE.MathUtils.lerp(baseRadius, flipperShape.palmHalfWidth, palm);
  const offset = flipperShape.elbowOffset * proximal * (1 - distal) * (1 - palm);
  const tipZ = armBind.z + flipperShape.tipSweep * smooth(along, armBind.upper + armBind.lower * 0.65, end);
  const depth = THREE.MathUtils.lerp(flipperShape.depthScale, flipperShape.palmDepthScale, palm);
  const tube = Math.hypot(x - dx * along + dy * offset, y - dy * along - dx * offset, (z - tipZ) / depth) - radius;
  // One continuous implicit palm, trimmed by a shallow three-wave rim.
  // No separate finger spheres, detached caps, or additional bones.
  const u = clamp(across / flipperShape.palmHalfWidth, -1, 1);
  const rim = length - flipperShape.edgeRound * u ** 4 + flipperShape.lobeHeight * Math.cos(3 * Math.PI * u);
  return -union(-tube, -(axial - rim), flipperShape.rimRound);
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
    const arm = bone(`${side}Arm`, torso, [sign * armBind.x, armBind.y - 0.85, armBind.z]);
    arm.rotation.z = sign * armBind.restAngle;
    bone(`${side}Elbow`, arm, [0, -armBind.upper, 0]);
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  function skin(name, geometry, color, weighting) {
    const indices = [], weights = [], p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [joints, influence] = weighting(p.getX(i), p.getY(i), p.getZ(i));
      indices.push(...joints); weights.push(...influence);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh); mesh.bind(skeleton); mesh.frustumCulled = false;
  }
  source.updateMatrixWorld(true);
  source.traverse(o => {
    if (!o.isMesh || /flipper|Pear/i.test(o.name)) return;
    const joint = /foot|fold/i.test(o.name) ? 0 : 2;
    skin(o.name, o.geometry.clone().applyMatrix4(o.matrixWorld), o.material.color, () => [[joint, 0, 0, 0], [1, 0, 0, 0]]);
  });

  const resolution = 160, extent = 2.6, centerY = 2;
  const mc = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 400000);
  mc.isolation = 0;
  for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const px = (x / resolution * 2 - 1) * extent, py = (y / resolution * 2 - 1) * extent + centerY, pz = (z / resolution * 2 - 1) * extent;
    mc.field[x + y * resolution + z * resolution ** 2] = -union(bodyField(px, py, pz), flipperField(px, worldY(py), pz), 0.18);
  }
  mc.update();
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(mc.geometry.attributes.position.array.slice(0, mc.count * 3), 3));
  raw.scale(extent, extent, extent); raw.translate(0, centerY, 0);
  const p = raw.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, worldY(p.getY(i)));
  // Weld position only, before assigning normals/weights. This produces one
  // indexed shell, not a merge of intersecting body and flipper components.
  const geometry = mergeVertices(raw, 1e-5), triangles = [];
  const index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) if (index[i] !== index[i + 1] && index[i] !== index[i + 2] && index[i + 1] !== index[i + 2]) triangles.push(index[i], index[i + 1], index[i + 2]);
  geometry.setIndex(triangles); geometry.computeVertexNormals();
  skin('PsyduckSurface', geometry, '#e8c574', (x, y, z) => {
    const arm = x < 0 ? 3 : 5;
    const along = (Math.abs(x) - armBind.x) * dx + (y - armBind.y) * dy;
    const across = (Math.abs(x) - armBind.x) * -dy + (y - armBind.y) * dx;
    const radial = Math.hypot(across, (z - armBind.z) / 0.9);
    // A broad, smooth shoulder envelope avoids using the sharp SDF ownership
    // boundary as a weight boundary (which stretches a few edges on raising).
    const headProtection = 1 - smooth(y, 1.72, 1.98) * (1 - smooth(along, 0.25, 0.65));
    const armWeight = smooth(along, -0.20, 0.75) * (1 - smooth(radial, 0.24, 0.65)) * headProtection;
    const elbow = smooth(along, armBind.upper - flipperShape.elbowBlendBefore, armBind.upper + flipperShape.elbowBlendAfter);
    const low = y < 1.5, t = low ? smooth(y, 0.35, 1.35) : smooth(y, 1.55, 2.1);
    return [[low ? 0 : 1, low ? 1 : 2, arm, arm + 1], [(1 - armWeight) * (1 - t), (1 - armWeight) * t, armWeight * (1 - elbow), armWeight * elbow]];
  });
  mc.geometry.dispose(); mc.material.dispose(); raw.dispose();
  return root;
}
