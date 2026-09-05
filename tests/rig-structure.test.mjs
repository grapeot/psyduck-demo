import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { armBind, applyPose, preset, addOutlines } from '../src/rig.js';
import { inspectConnectedSkin, inspectShoulderSections } from './rig-assertions.js';

test('reloaded yellow shell is closed/connected, has real shoulder cross sections and blended weights through extreme poses', async () => {
  const bytes = await readFile('public/models/psyduck_rigged.glb');
  const root = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  root.updateMatrixWorld(true);
  const topology = inspectConnectedSkin(root), shell = root.getObjectByName('PsyduckSurface');
  shell.skeleton.update();
  const v = shell.position.clone(); let restError = 0;
  for (let i = 0; i < shell.geometry.attributes.position.count; i++) {
    const w=shell.geometry.attributes.skinWeight.array,indices=shell.geometry.attributes.skinIndex.array;
    const weights=Array.from({length:4},(_,k)=>w[i*4+k]);
    assert.ok(weights.every(value=>Number.isFinite(value)&&value>=0)&&Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-5);
    for(let k=0;k<4;k++)assert.ok(Number.isInteger(indices[i*4+k])&&indices[i*4+k]>=0&&indices[i*4+k]<shell.skeleton.bones.length);
    const original = v.fromBufferAttribute(shell.geometry.attributes.position, i).clone(); shell.applyBoneTransform(i, v); restError = Math.max(restError, v.distanceTo(original));
  }
  assert.ok(restError < 2e-6, `Open-rest inverse binds inconsistent: ${restError}`);
  addOutlines(root);
  const outline = root.getObjectByName('PsyduckSurface_outline');
  assert.equal(outline.skeleton, shell.skeleton);
  assert.deepEqual(outline.bindMatrix.elements, shell.bindMatrix.elements);
  assert.deepEqual(outline.geometry.attributes.skinWeight.array, shell.geometry.attributes.skinWeight.array);
  assert.ok(shell.castShadow && shell.receiveShadow);
  const poses = {
    bind: { ...preset('idle'), left: armBind.restAngle, right: armBind.restAngle },
    idle: preset('idle'), armsSpread: preset('armsSpread'), raiseOneArm: preset('raiseOneArm'), holdHead: preset('holdHead'),
    headTiltRaise: {...preset('raiseOneArm'), head:.24}, swayRaise: {...preset('raiseOneArm'),head:-.18,torso:-.12},
    holdTilt: {...preset('holdHead'),head:.24,torso:.12}, extreme: {...preset('idle'),left:2.9,right:2.9,leftBend:armBind.maxElbow,rightBend:armBind.maxElbow,head:.25,nod:.12,torso:.13},
    lowExtreme: {...preset('idle'),left:.12,right:.12,leftBend:armBind.maxElbow,rightBend:armBind.maxElbow,head:-.25,nod:-.12,torso:-.13},
    asymmetricExtreme: {...preset('idle'),left:.12,right:2.9,rightBend:armBind.maxElbow,head:-.25,nod:.12,torso:.13}
  };
  const sections = {};
  for (const [name, pose] of Object.entries(poses)) {
    applyPose(root, pose); sections[name] = inspectShoulderSections(root);
    for (const side of ['left','right']) assert.ok(Math.abs(root.getObjectByName(`${side}Elbow`).position.length() - armBind.upper) < 1e-6);
  }
  await mkdir('test-results', { recursive: true });
  const all = Object.values(sections).flatMap(s => Object.values(s));
  const summary = { minArea: Math.min(...all.map(s => s.area)), minRadius: Math.min(...all.map(s => s.minRadius)), maxEdge: Math.max(...all.map(s => s.maxEdge)), maxStretch: Math.max(...all.map(s => s.maxStretch)) };
  const limitsPassed = all.every(s => s.area > 0.035 && s.minRadius > 0.045 && s.crossingEdges > 20 && s.maxEdge < 0.16 && s.maxStretch < 5);
  await writeFile('test-results/shoulder-structure.json', JSON.stringify({assetSha256:createHash('sha256').update(bytes).digest('hex'),limitsPassed,topology,restError,summary,poses,sections},null,2));
  for (const [name, section] of Object.entries(sections)) for (const [side, s] of Object.entries(section)) {
    assert.ok(s.area > 0.035 && s.minRadius > 0.045 && s.crossingEdges > 20, `${name}/${side}: shoulder collapsed ${JSON.stringify(s)}`);
    assert.ok(s.maxEdge < 0.16 && s.maxStretch < 5, `${name}/${side}: shoulder stretched ${JSON.stringify(s)}`);
  }
});
