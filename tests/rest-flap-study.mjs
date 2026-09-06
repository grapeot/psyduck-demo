import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = process.argv[2];
if (!output?.startsWith('test-results/rest-flap-review/')) {
  throw new Error('Expected a unique output below test-results/rest-flap-review/');
}
try {
  await access(`${output}/measurements.json`);
  throw new Error(`Refusing to overwrite existing evidence: ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      throw new Error('Camera forbidden in rest-flap study');
    };
  });
  await page.goto(`${server.resolvedUrls.local[0]}tests/flap-view.html`);
  await page.waitForFunction(() => window.renderReady);

  const setup = await page.evaluate(() => window.flapSetup);
  const poses = {
    minimum: { left: 0.12, right: 0.12, head: 0, nod: 0, torso: 0 },
    neutral: { left: 0.22, right: 0.22, head: 0, nod: 0, torso: 0 },
    armsSpread: setup.poses.armsSpread,
    raiseOneArm: setup.poses.raiseOneArm,
    holdHead: setup.poses.holdHead,
  };
  const views = ['front', 'rightQuarter', 'rightSide'];
  const renders = {};
  for (const [poseName, pose] of Object.entries(poses)) {
    for (const view of views) {
      const data = await page.evaluate(([value, cameraView]) => window.flapRender(value, cameraView), [pose, view]);
      const path = `${output}/${poseName}-${view}.png`;
      await page.screenshot({ path });
      renders[`${poseName}-${view}`] = { ...data, path };
    }
  }

  const sweep = [];
  for (const angle of [0.12, 0.22, 0.5, 0.85, 1.2, Math.PI / 2, 2.1, 2.5, 2.99]) {
    const pose = { left: angle, right: angle, head: 0, nod: 0, torso: 0 };
    const data = await page.evaluate(value => window.flapRender(value, 'rightQuarter'), pose);
    const path = `${output}/sweep-${angle.toFixed(2)}.png`;
    await page.screenshot({ path });
    sweep.push({ angle, ...data, path });
  }
  const sheet = await browser.newPage({ viewport: { width: 1500, height: 1560 } });
  await sheet.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(3,500px);font:14px monospace}figure{margin:0}img{width:500px;height:500px}figcaption{text-align:center;height:20px}</style>${sweep.map(entry => `<figure><img src="${server.resolvedUrls.local[0]}${entry.path}"><figcaption>${entry.angle.toFixed(2)} rad / rightQuarter</figcaption></figure>`).join('')}`);
  await sheet.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  await sheet.screenshot({ path: `${output}/sweep-sheet.png` });

  const asset = await readFile('public/models/psyduck_rigged.glb');
  const measurements = {
    assetSha256: createHash('sha256').update(asset).digest('hex'),
    setup,
    poses,
    views,
    renders,
    sweep,
    errors,
    environment: {
      page: 'tests/flap-view.html',
      browser: 'Chrome via Playwright',
      server: 'isolated Vite server on an ephemeral loopback port',
      cameraAccess: false,
    },
  };
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  assert.deepEqual(errors, []);
  console.log(`${output}: ${Object.keys(renders).length} screenshots`);
} finally {
  await browser.close();
  await server.close();
}
