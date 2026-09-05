import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import copy from '../ui_copy.json';
import { addOutlines, applyPose, neutral, preset } from './rig.js';
import { Retarget } from './retarget.js';
import { CameraController } from './camera.js';
import './style.css';

const c = copy, $ = id => document.getElementById(id);
document.title = c.app.title;
$('app').innerHTML = `<main class="page">
  <header><h1>${c.app.title}</h1><p>${c.app.description}</p></header>
  <section class="stage"><canvas id="scene" aria-label="${c.app.title}"></canvas><div class="stage-note">${c.status.upperBodyOnly}</div></section>
  <aside class="panel">
    <section><div id="status" class="status" role="status" aria-live="polite"></div><p id="hint" class="hint"></p><div class="progress"><span id="progress"></span></div></section>
    <div class="actions"><button id="start" class="primary" disabled>${c.actions.startFollowing}</button><button id="rig-retry" hidden>${c.actions.retry}</button><button id="stop" hidden>${c.actions.cancel}</button><button id="calibrate" disabled>${c.actions.recalibrate}</button></div>
    <section><div id="presets">${Object.entries(c.presets).map(([id, label]) => `<button data-preset="${id}" disabled aria-pressed="${id === 'idle'}">${label}</button>`).join('')}</div><div class="actions" style="margin-top:8px"><button id="auto" disabled aria-pressed="false">${c.actions.autoDemo}</button><button id="view" disabled>${c.actions.viewModel}</button></div></section>
    <section><label><input id="mirror" type="checkbox" checked>${c.actions.mirrorTracking}</label><div class="actions"><button id="preview-toggle" aria-pressed="true">${c.actions.hidePreview}</button><button id="skeleton-toggle" aria-pressed="false">${c.actions.showSkeleton}</button></div><p id="camera-note" class="fine"></p></section>
    <div id="preview" class="preview mirrored"><video id="video" muted playsinline></video><canvas id="landmarks" width="640" height="480"></canvas><div id="preview-label" class="preview-label"></div></div>
    <details><summary>${c.metrics.debugDisplay}</summary><p class="metric" id="metrics"></p><p>${c.app.scopeNotice}</p></details>
    <section class="privacy fine"><p>${c.privacy.cameraOnlyNoMic}</p><p>${c.privacy.localProcessingOnly}</p><p>${c.privacy.noUploadNoRecord}</p><p>${c.privacy.firstTimeResourceDownload}</p><a href="${import.meta.env.BASE_URL}static.html">${c.actions.viewModel}</a></section>
  </aside></main>`;
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.65, 0); controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 6; controls.maxDistance = 16; controls.maxPolarAngle = Math.PI * 0.49;
const front = () => {
  controls.enableDamping = false; controls.update();
  camera.position.set(0, 2.9, 10.7); controls.target.set(0, 1.65, 0); controls.update(); controls.enableDamping = true;
};
front();
scene.add(new THREE.HemisphereLight('#fff5dd', '#8c9d80', 2.3));
const light = new THREE.DirectionalLight('#fff3d7', 2.2); light.position.set(-3, 7, 5); light.castShadow = true;
light.shadow.mapSize.set(1024, 1024); Object.assign(light.shadow.camera, { left: -4, right: 4, top: 5, bottom: -4, near: 0.1, far: 20 }); light.shadow.normalBias = 0.015;
scene.add(light);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.3, 80), new THREE.MeshStandardMaterial({ color: '#c4d0ad', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = 0.004; ground.receiveShadow = true; scene.add(ground);
for (const r of [2.5, 2.7]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 90), new THREE.MeshBasicMaterial({ color: '#d5e3cc', side: THREE.DoubleSide, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
}
let rig, pose = neutral(), desired = neutral(), selected = 'idle', auto = false, active = false, initializing = false, showPreview = true, showSkeleton = false;
let lastPoints = [], poseCount = 0, renderCount = 0, metricTime = performance.now(), lastFrame = metricTime;
const retarget = new Retarget();
let rigState = 'loading';
function status(name) {
  if (!rig) name = rigState === 'failed' ? 'rigLoadFailed' : 'loadingResources';
  $('status').textContent = c.status[name] || c.errors[name] || name;
}
function cameraNotice() {
  $('preview').hidden = !showPreview || !active;
  $('camera-note').textContent = active && !showPreview ? c.status.previewHiddenCameraActive : active ? c.privacy.cameraOnlyNoMic : c.status.cameraOff;
  $('preview-label').textContent = active ? c.status.upperBodyOnly : c.status.cameraOff;
}
const assets = { wasm: new URL(`${import.meta.env.BASE_URL}vision`, location.origin).href, model: new URL(`${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, location.origin).href };
const controller = new CameraController({ video: $('video'), assets,
  onState(name) {
    initializing = ['requestingPermission', 'loadingResources'].includes(name);
    active = initializing || name === 'calibrating';
    document.body.dataset.active = String(active); controls.enabled = !active;
    $('start').hidden = active; $('stop').hidden = !active;
    $('stop').textContent = initializing ? c.actions.cancel : c.actions.stopFollowing;
    $('calibrate').disabled = !active || initializing;
    $('start').textContent = c.errors[name] ? c.actions.retry : c.actions.startFollowing;
    status(name); cameraNotice();
    $('hint').textContent = active ? c.hints.upperBodyInFrame : '';
    if (!active) { retarget.reset(); desired = preset(selected); lastPoints = []; $('progress').style.width = '0%'; }
  },
  onResult(data) {
    lastPoints = data.landmarks; poseCount++;
    desired = retarget.update(data.landmarks, data.width, data.height, data.timestamp, $('mirror').checked);
    status(retarget.status);
    $('hint').textContent = c.hints[retarget.status === 'personNotFound' ? 'returnToFrame' : retarget.status === 'calibrating' ? 'faceCameraHold' : 'upperBodyInFrame'];
    $('progress').style.width = `${Math.min(100, retarget.validMs / 20)}%`;
  },
});
status('cameraOff'); cameraNotice();
$('start').onclick = () => {
  if (!rig) return;
  if (!isSecureContext) { status('insecureContext'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.Worker || !globalThis.createImageBitmap) { status('browserUnsupported'); return; }
  retarget.reset(); auto = false; updateAuto(); front(); controller.start();
};
$('stop').onclick = () => controller.stop();
$('calibrate').onclick = () => { retarget.reset(); status('calibrating'); $('progress').style.width = '0%'; };
$('mirror').onchange = () => { $('preview').classList.toggle('mirrored', $('mirror').checked); retarget.reset(); if (active) status('calibrating'); };
$('preview-toggle').onclick = () => {
  showPreview = !showPreview; $('preview').hidden = !showPreview;
  $('preview-toggle').textContent = c.actions[showPreview ? 'hidePreview' : 'showPreview']; $('preview-toggle').setAttribute('aria-pressed', showPreview); cameraNotice();
};
$('skeleton-toggle').onclick = () => {
  showSkeleton = !showSkeleton; $('skeleton-toggle').textContent = c.actions[showSkeleton ? 'hideSkeleton' : 'showSkeleton']; $('skeleton-toggle').setAttribute('aria-pressed', showSkeleton);
};
function updateAuto() { $('auto').textContent = c.actions[auto ? 'pauseDemo' : 'autoDemo']; $('auto').setAttribute('aria-pressed', auto); }
function select(name) {
  selected = name;
  document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', b.dataset.preset === selected));
}
document.querySelectorAll('[data-preset]').forEach(b => { b.onclick = () => { if (active) controller.stop(); auto = false; updateAuto(); select(b.dataset.preset); }; });
$('auto').onclick = () => { if (active) controller.stop(); auto = !auto; updateAuto(); };
$('view').onclick = () => { if (active) controller.stop(); auto = false; updateAuto(); controls.enabled = true; front(); };
addEventListener('pagehide', () => controller.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden && active) controller.stop(); });
function resize() {
  const { width, height } = $('scene').parentElement.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.fov = width / height < 0.85 ? 44 : 32; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('scene').parentElement); resize();
const context = $('landmarks').getContext('2d');
function drawPoints() {
  const video = $('video');
  if (video.videoWidth && ($('landmarks').width !== video.videoWidth || $('landmarks').height !== video.videoHeight)) { $('landmarks').width = video.videoWidth; $('landmarks').height = video.videoHeight; }
  const w = $('landmarks').width, h = $('landmarks').height; context.clearRect(0, 0, w, h);
  if (!showSkeleton || !showPreview) return;
  context.strokeStyle = '#ffe8a3'; context.fillStyle = '#f9f4dc'; context.lineWidth = 3;
  for (const [a, b] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]) {
    const p = lastPoints[a], q = lastPoints[b];
    if (!p || !q || p.visibility < 0.55 || q.visibility < 0.55) continue;
    context.beginPath(); context.moveTo(p.x * w, p.y * h); context.lineTo(q.x * w, q.y * h); context.stroke();
  }
}
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if (!active) {
    if (auto) select(Object.keys(c.presets)[Math.floor(now / 3500) % 6]);
    desired = preset(selected, now / 1000);
  }
  for (const k of Object.keys(pose)) pose[k] += (desired[k] - pose[k]) * (1 - Math.exp(-dt / 0.10));
  if (rig) applyPose(rig, pose);
  controls.update(); drawPoints(); renderer.render(scene, camera); renderCount++;
  if (now - metricTime > 1000) {
    const seconds = (now - metricTime) / 1000;
    $('metrics').textContent = `${c.metrics.renderFps}: ${(renderCount / seconds).toFixed(0)} · ${c.metrics.poseUpdateRate}: ${(poseCount / seconds).toFixed(1)}`;
    renderCount = poseCount = 0; metricTime = now;
  }
  window.renderReady = Boolean(rig);
});
async function loadRig() {
  rigState = 'loading'; $('rig-retry').hidden = true; status('loadingResources');
  try {
    const loaded = (await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/psyduck_rigged.glb`)).scene;
    addOutlines(loaded); scene.add(loaded); rig = loaded; rigState = 'ready';
    document.querySelectorAll('[data-preset], #auto, #view, #start').forEach(b => { b.disabled = false; });
    status('cameraOff');
  } catch (error) {
    rigState = 'failed'; $('rig-retry').hidden = false; status('rigLoadFailed'); console.error(error);
  }
}
$('rig-retry').onclick = () => { if (rigState === 'failed') loadRig(); };
await loadRig();
// Inspection surface contains no camera frames or recorded data.
window.psyduck = { get rig() { return rig; }, get pose() { return pose; }, controller, retarget,
  setView(name) { const positions = { front: [0, 2.9, 10.7], side: [10.7, 2.9, 0], back: [0, 2.9, -10.7], quarter: [6, 3.3, 9] }; camera.position.set(...positions[name]); controls.update(); },
  get cameraLocked() { return !controls.enabled; },
  get cameraPosition() { return camera.position.toArray(); },
};
