import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const motionModel = 'shoulder_flap';
export const rigBoneNames = Object.freeze(['root', 'torso', 'head', 'leftArm', 'rightArm']);
export const armBind = Object.freeze({ x: 0.82, y: 1.66, z: 0.68, length: 1.04, restAngle: Math.PI / 2, minAngle: 0.12, maxAngle: 2.99, rigidBlendStart: 0.34, rigidFrom: 0.55 });
export const flipperShape = Object.freeze({ rootRadius: 0.24, tipRadius: 0.06, fullness: 0.035, bow: -0.035, tipCurve: 0, depthScale: 0.50 });
export const flipperCurveAt = t => flipperShape.bow * Math.sin(Math.PI * t) + flipperShape.tipCurve * t ** 3;
export const holdAngles = Object.freeze({ left: 2.99, right: 2.94 });
export const neutral = () => ({ left: 0.22, right: 0.22, head: 0, nod: 0, torso: 0 });
// Character faces +Z, screen right is +X. Open T-pose bind rotations are
// baked into the inverse binds; pose angles remain absolute from local -Y.
// Local +Z raises the screen-right whole flap; screen-left uses the negative.
// Contact is a chosen shoulder pose, not an IK request for an arbitrary point.
export function preset(name, time = 0) {
  const p = neutral();
  if (name === 'raiseOneArm') p.right = 2.10;
  if (name === 'armsSpread') p.left = p.right = Math.PI / 2;
  if (name === 'holdHead') {
    p.left = holdAngles.left; p.right = holdAngles.right;
  }
  if (name === 'headTilt') p.head = 0.24;
  if (name === 'bodySway') p.torso = Math.sin(time * 1.7) * 0.12;
  if (name === 'idle') p.nod = Math.sin(time * 1.4) * 0.018;
  return p;
}
export function applyPose(root, pose) {
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    root.getObjectByName(`${side}Arm`).rotation.z = sign * clamp(pose[side] || 0, armBind.minAngle, armBind.maxAngle);
  }
  root.getObjectByName('head').rotation.set(clamp(pose.nod || 0, -0.12, 0.12), 0, clamp(pose.head || 0, -0.25, 0.25));
  root.getObjectByName('torso').rotation.z = clamp(pose.torso || 0, -0.13, 0.13);
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
}

export function validateRig(root) {
  const names=[];root.traverse(o=>{if(o.isBone)names.push(o.name);});
  const metadata=root.getObjectByName('PsyduckRig')?.userData;
  if (metadata?.motionModel !== motionModel || metadata.rigVersion !== 1
    || names.length !== rigBoneNames.length || rigBoneNames.some(name=>!names.includes(name))
    || ['x','y','z','length','restAngle','rigidBlendStart','rigidFrom'].some(key=>metadata.bind?.[key]!==armBind[key])
    || Object.keys(flipperShape).some(key=>metadata.shape?.[key]!==flipperShape[key])) {
    throw new Error('Expected shoulder_flap v1 asset with exactly five bones; regenerate the rig');
  }
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
