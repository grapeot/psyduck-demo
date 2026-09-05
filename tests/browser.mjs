import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import copy from '../ui_copy.json' with { type: 'json' };
import { preparePoseFixture, poseFixture } from './prepare-pose-fixture.mjs';
import { sampleFlipperVertices, inspectConnectedSkin } from './rig-assertions.js';
import { preset } from '../src/rig.js';

await mkdir('test-results', { recursive: true });
const output = await mkdtemp('test-results/browser-run-');
// Keep immutable per-run evidence; the established root report is a latest
// result index used by clean-build. Archive its previous contents first.
try { await copyFile('test-results/browser-report.json', `${output}/previous-report.json`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const poseImage = await preparePoseFixture();
const requests = [], responses = [], failedRequests = [], serverRequests = [], errors = [], screenshots = [], checks = {};
const base = '/psyduck-demo/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.task': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  serverRequests.push({ method: req.method, path: pathname });
  if (pathname === `${base}__fixtures__/pose.jpg`) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(poseImage); return; }
  if (!pathname.startsWith(base) || pathname.includes('..')) { res.writeHead(404).end(); return; }
  const path = resolve('dist', pathname.slice(base.length) || 'index.html');
  try { const bytes = await readFile(path); res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`, url = origin + base;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1200, height: 820 } });
context.on('request', r => requests.push({ method: r.method(), url: r.url(), type: r.resourceType() }));
context.on('response', r => responses.push({ status: r.status(), url: r.url() }));
context.on('requestfailed', r => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }));
context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
async function load(init) {
  const p = await context.newPage();
  if (init) await p.addInitScript(init);
  await p.goto(url); await p.waitForFunction(() => window.renderReady, {}, { timeout: 30000 }); return p;
}
async function choosePreset(page, name) {
  await page.locator(`[data-preset="${name}"]`).click();
  await page.waitForFunction(({ expected, name }) => Object.keys(expected).every(key => key === 'nod'
    || (name === 'bodySway' && key === 'torso') || Math.abs(window.psyduck.pose[key] - expected[key]) < 0.02), { expected: preset(name), name });
}
const synthetic = () => {
  window.cameraRequests = 0;
  navigator.mediaDevices.getUserMedia = async constraints => {
    window.cameraRequests++; window.constraints = constraints;
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const c = canvas.getContext('2d'); let i = 0;
    const draw = () => { c.fillStyle = i++ % 2 ? '#dfe6ce' : '#dfe6cf'; c.fillRect(0, 0, 640, 480); };
    draw(); window.syntheticTimer = setInterval(draw, 60);
    window.syntheticStream = canvas.captureStream(15);
    return window.syntheticStream;
  };
};
try {
  checks.browser = await browser.version();
  const page = await load(() => { navigator.mediaDevices.getUserMedia = () => { throw new Error('Unexpected camera request'); }; });
  checks.initialNoML = !requests.some(r => /vision|\.task|pose-worker/.test(r.url)); assert.ok(checks.initialNoML);
  checks.connectedSkin = await page.evaluate(inspectConnectedSkin);
  checks.rig = await page.evaluate(() => {
    const root = window.psyduck.rig, meshes = []; root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    let weighted = 0, vertices = 0, outlines = 0;
    for (const mesh of meshes) {
      if (mesh.userData.outline) outlines++;
      const g = mesh.geometry, w = g.attributes.skinWeight, idx = g.attributes.skinIndex;
      if (!w || !idx || !mesh.skeleton.bones.length) throw new Error('Missing skin');
      for (let i = 0; i < w.count; i++) {
        const values = [w.getX(i), w.getY(i), w.getZ(i), w.getW(i)];
        if (!values.every(v => Number.isFinite(v) && v >= 0) || Math.abs(values.reduce((a,b) => a+b) - 1) > 1e-5) throw new Error('Invalid weight');
        if (values.filter(v => v > 0).length > 1) weighted++;
        if ([idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)].some(v => v >= mesh.skeleton.bones.length)) throw new Error('Invalid joint');
      }
      if (!g.attributes.normal.array.every(Number.isFinite) || !g.attributes.position.array.every(Number.isFinite)) throw new Error('Invalid geometry');
      vertices += w.count;
    }
    const changed = {};
    for (const name of ['head', 'torso', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow']) {
      const bone = root.getObjectByName(name), old = bone.rotation.z, before = [];
      root.updateMatrixWorld(true); meshes.forEach(m => m.skeleton.update());
      for (const m of meshes.filter(m => !m.userData.outline)) {
        for (let i = 0; i < m.geometry.attributes.position.count; i += 20) {
          const v = bone.position.clone().fromBufferAttribute(m.geometry.attributes.position, i); m.applyBoneTransform(i, v); before.push([m, i, v]);
        }
      }
      bone.rotation.z += 0.5; root.updateMatrixWorld(true); meshes.forEach(m => m.skeleton.update());
      let max = 0;
      for (const [m, i, previous] of before) { const v = bone.position.clone().fromBufferAttribute(m.geometry.attributes.position, i); m.applyBoneTransform(i, v); max = Math.max(max, v.distanceTo(previous)); }
      if (max < 0.08) throw new Error(`Bone not deforming: ${name} ${max}`);
      changed[name] = max; bone.rotation.z = old;
    }
    root.updateMatrixWorld(true); meshes.forEach(m => m.skeleton.update());
    if (!outlines || !weighted) throw new Error('No outline or smooth weights');
    return { meshes: meshes.length, outlines, vertices, smoothWeightVertices: weighted, maxDisplacementByBone: changed };
  });
  const presetVertices = {};
  for (const name of ['idle', 'raiseOneArm', 'armsSpread', 'holdHead', 'headTilt', 'bodySway']) {
    await choosePreset(page, name);
    presetVertices[name] = (await page.evaluate(sampleFlipperVertices))[1];
    const path = `${output}/${name}.png`; await page.screenshot({ path }); screenshots.push(path);
  }
  checks.presetVertexDisplacement = Object.fromEntries(['raiseOneArm', 'armsSpread', 'holdHead'].map(name => [name, Math.hypot(...presetVertices[name].map((v, i) => v - presetVertices.idle[i]))]));
  assert.ok(Object.values(checks.presetVertexDisplacement).every(v => v > 0.3));
  await choosePreset(page, 'headTilt');
  for (const view of ['side', 'quarter', 'back']) {
    await page.evaluate(v => window.psyduck.setView(v), view); await page.waitForTimeout(300);
    const path = `${output}/headTilt-${view}.png`; await page.screenshot({ path }); screenshots.push(path);
  }
  await choosePreset(page, 'holdHead');
  for (const view of ['side', 'quarter']) {
    await page.evaluate(v => window.psyduck.setView(v), view); await page.waitForTimeout(700);
    const path = `${output}/holdHead-${view}.png`; await page.screenshot({ path }); screenshots.push(path);
  }
  await page.locator('#auto').click(); assert.equal(await page.locator('#auto').getAttribute('aria-pressed'), 'true');
  await page.locator('#auto').click(); checks.demo = true;
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.psyduck.setView('front'));
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true }); screenshots.push(`${output}/mobile.png`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks.mobileLoads = true; await page.close();

  const rigFailure = await context.newPage();
  await rigFailure.addInitScript(() => {
    window.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.cameraRequests++; throw new Error('Camera must remain off'); };
  });
  let releaseRig;
  await rigFailure.route('**/models/psyduck_rigged.glb', async route => {
    await new Promise(resolve => { releaseRig = resolve; }); await route.abort();
  });
  await rigFailure.goto(url);
  assert.equal(await rigFailure.locator('#start').isDisabled(), true);
  assert.equal(await rigFailure.locator('[data-preset]:enabled').count(), 0);
  for (let i = 0; i < 100 && !releaseRig; i++) await rigFailure.waitForTimeout(50);
  assert.ok(releaseRig); releaseRig();
  await rigFailure.waitForFunction(message => document.getElementById('status').textContent === message, copy.errors.rigLoadFailed);
  assert.equal(await rigFailure.locator('#start').isDisabled(), true);
  assert.equal(await rigFailure.locator('[data-preset]:enabled').count(), 0);
  assert.equal(await rigFailure.locator('#auto').isDisabled(), true);
  assert.equal(await rigFailure.locator('#view').isDisabled(), true);
  assert.equal(await rigFailure.evaluate(() => Boolean(window.psyduck.rig)), false);
  await rigFailure.screenshot({ path: `${output}/rig-load-failed.png` }); screenshots.push(`${output}/rig-load-failed.png`);
  await rigFailure.unroute('**/models/psyduck_rigged.glb');
  await rigFailure.locator('#rig-retry').click();
  await rigFailure.waitForFunction(() => window.renderReady);
  assert.equal(await rigFailure.locator('#start').isEnabled(), true);
  assert.equal(await rigFailure.locator('[data-preset]:enabled').count(), 6);
  assert.equal(await rigFailure.locator('#auto').isEnabled(), true);
  assert.equal(await rigFailure.locator('#status').textContent(), copy.status.cameraOff);
  assert.equal(await rigFailure.evaluate(() => window.cameraRequests), 0);
  await rigFailure.locator('[data-preset="armsSpread"]').click();
  await rigFailure.waitForFunction(() => window.psyduck.pose.left > 1.4);
  checks.rigLoadFailureRetry = { loadingControlsDisabled: true, failureControlsDisabled: true, recovered: true, cameraRequests: 0 };
  await rigFailure.close();

  const denied = await load(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('mock denial', 'NotAllowedError'); }; });
  await denied.locator('#start').focus(); await denied.keyboard.press('Enter'); await denied.waitForFunction(() => document.getElementById('status').textContent.includes('未获准'));
  await denied.locator('[data-preset="armsSpread"]').click();
  await denied.waitForFunction(() => window.psyduck.pose.left > 1.4); checks.permissionDeniedDemo = true; await denied.close();

  const late = await load(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolvePermission = resolve; });
  });
  await late.locator('#start').click(); await late.locator('#stop').click();
  await late.evaluate(() => { window.lateStopped = false; window.resolvePermission({ getTracks: () => [{ stop() { window.lateStopped = true; } }] }); });
  await late.waitForFunction(() => window.lateStopped); assert.equal(await late.evaluate(() => window.psyduck.controller.session), null); checks.latePermissionCancel = true; await late.close();

  const smoke = await load(synthetic);
  smoke.on('console', m => { if (m.type() === 'error') console.log('smoke console:', m.text()); });
  await smoke.locator('#start').click();
  await smoke.waitForFunction(() => window.psyduck.controller.session?.lastTimestamp > 0 || !document.getElementById('start').hidden, {}, { timeout: 45000 });
  checks.realMediaPipe = await smoke.evaluate(() => ({ state: document.getElementById('status').textContent, timestamp: window.psyduck.controller.session?.lastTimestamp, audio: window.constraints?.audio, cameraRequests: window.cameraRequests, isolated: crossOriginIsolated, worker: Boolean(window.psyduck.controller.session?.worker), cameraLocked: window.psyduck.cameraLocked }));
  console.log('Real MediaPipe smoke:', checks.realMediaPipe);
  assert.ok(checks.realMediaPipe.timestamp > 0, 'Actual Worker inference did not complete');
  assert.equal(checks.realMediaPipe.audio, false); assert.equal(checks.realMediaPipe.isolated, false); assert.ok(checks.realMediaPipe.worker && checks.realMediaPipe.cameraLocked);
  const cameraBefore = await smoke.evaluate(() => window.psyduck.cameraPosition);
  await smoke.mouse.move(400, 420); await smoke.mouse.down(); await smoke.mouse.move(250, 420, { steps: 8 }); await smoke.mouse.up();
  const cameraAfter = await smoke.evaluate(() => window.psyduck.cameraPosition);
  assert.ok(cameraBefore.every((v, i) => Math.abs(v - cameraAfter[i]) < 1e-6)); checks.followCameraLocked = true;
  await smoke.locator('#preview-toggle').click();
  assert.equal(await smoke.evaluate(() => window.syntheticStream.getTracks()[0].readyState), 'live');
  await smoke.locator('#stop').click();
  assert.equal(await smoke.evaluate(() => window.syntheticStream.getTracks()[0].readyState), 'ended'); checks.stopReleasesTrack = true;
  await smoke.mouse.move(400, 420); await smoke.mouse.down(); await smoke.mouse.move(250, 420, { steps: 8 }); await smoke.mouse.up();
  const orbitAfter = await smoke.evaluate(() => window.psyduck.cameraPosition);
  assert.ok(cameraBefore.some((v, i) => Math.abs(v - orbitAfter[i]) > 0.1)); checks.demoOrbitEnabled = true;
  await smoke.close();

  const positive = await load(() => {
    window.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.cameraRequests++; window.constraints = constraints;
      const image = new Image(); image.src = './__fixtures__/pose.jpg'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); const draw = () => ctx.drawImage(image, 0, 0);
      draw(); window.fixtureTimer = setInterval(draw, 65);
      window.fixtureStream = canvas.captureStream(15); return window.fixtureStream;
    };
  });
  const beforePositive = await positive.evaluate(sampleFlipperVertices);
  await positive.evaluate(() => {
    const consume = window.psyduck.controller.onResult;
    window.psyduck.controller.onResult = data => {
      if (data.landmarks.length) window.positiveMessage = { id: data.id, timestamp: data.timestamp, width: data.width, height: data.height, count: data.landmarks.length };
      consume(data);
    };
  });
  await positive.locator('#start').click();
  await positive.waitForFunction(() => window.positiveMessage?.count === 33 && window.psyduck.pose.left > 1.0 && window.psyduck.pose.right > 1.0, {}, { timeout: 45000 });
  const afterPositive = await positive.evaluate(sampleFlipperVertices);
  const delta = afterPositive.map((p, side) => p.map((v, i) => v - beforePositive[side][i]));
  assert.ok(delta.flat().every(Number.isFinite));
  assert.ok(delta[0][0] < -0.3 && delta[1][0] > 0.3 && delta.every(v => v[1] > 0.3), 'Public spread pose must lift both real flippers outward/upward');
  checks.positiveMediaPipe = { fixture: poseFixture, message: await positive.evaluate(() => window.positiveMessage), vertexDelta: delta, path: 'real CPU Worker -> CameraController -> app.onResult -> Retarget -> reloaded SkinnedMesh', cameraHardwareUsed: false };
  await positive.screenshot({ path: `${output}/positive-pose.png` }); screenshots.push(`${output}/positive-pose.png`);
  await positive.locator('#stop').click();
  assert.equal(await positive.evaluate(() => window.fixtureStream.getTracks()[0].readyState), 'ended'); await positive.close();

  const failure = await load(synthetic);
  await failure.route('**/models/pose_landmarker_lite.task', route => route.abort());
  await failure.locator('#start').click();
  await failure.waitForFunction(message => document.getElementById('status').textContent === message, copy.errors.modelLoadFailed, { timeout: 40000 });
  assert.equal(await failure.evaluate(() => window.syntheticStream.getTracks()[0].readyState), 'ended');
  await failure.locator('[data-preset="headTilt"]').click();
  await failure.waitForFunction(() => window.psyduck.pose.head > 0.2);
  checks.workerFailureCleanup = true; checks.poseTaskFailureDemo = true; await failure.close();

  const cancelled = await load(synthetic);
  let releaseModel;
  await cancelled.route('**/models/pose_landmarker_lite.task', async route => {
    await new Promise(resolve => { releaseModel = resolve; });
    try { await route.continue(); } catch { /* Context may close after cancellation. */ }
  });
  await cancelled.locator('#start').click();
  for (let i = 0; i < 300 && !releaseModel; i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(releaseModel, 'Model initialization request not observed');
  await cancelled.locator('#stop').click(); releaseModel();
  assert.equal(await cancelled.evaluate(() => window.syntheticStream.getTracks()[0].readyState), 'ended');
  assert.equal(await cancelled.evaluate(() => window.psyduck.controller.session), null); checks.cancelDuringRealWorkerInit = true; await cancelled.close();

  const legacy = await context.newPage();
  await legacy.setViewportSize({ width: 800, height: 800 }); await legacy.goto(`${url}static.html`);
  await legacy.waitForFunction(() => window.renderReady && window.sceneStats, {}, { timeout: 120000 });
  checks.legacyStatic = await legacy.evaluate(() => window.sceneStats());
  await legacy.screenshot({ path: `${output}/static.png`, timeout: 120000 }); screenshots.push(`${output}/static.png`); await legacy.close();

  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(requests.every(r => r.method === 'GET' && r.url.startsWith(origin)), 'Unexpected upload or external request');
  for (const pattern of [/\.glb$/, /pose-worker.*\.js$/, /\.wasm$/, /\.task$/]) assert.ok(serverRequests.some(r => pattern.test(r.path)), `Missing production asset ${pattern}`);
  for (const pattern of [/\.glb$/, /pose-worker.*\.js$/, /\.wasm$/, /\.task$/]) assert.ok(responses.some(r => r.status === 200 && pattern.test(r.url)), `Asset did not return 200: ${pattern}`);
  checks.productionSubpath = true; checks.noUploadObserved = true;
  console.log(JSON.stringify(checks, null, 2));
} finally {
  const report = JSON.stringify({ output, checks, screenshots, errors, requests, responses, failedRequests, serverRequests }, null, 2);
  await writeFile(`${output}/report.json`, report);
  await writeFile('test-results/browser-report.json', report);
  await browser.close(); await new Promise(r => server.close(r));
}
