import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';

const round = process.argv[2] || 'final';
if (!/^(r\d{2}|baseline|final)$/.test(round)) throw new Error('Expected a round id, baseline or final');
const output = `iterations/${round}`;
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const size = round === 'final' ? 1600 : 1200;
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  await page.goto(`${server.resolvedUrls.local[0]}static.html`);
  await page.waitForFunction(() => window.renderReady, {}, { timeout: 120000 });
  await page.locator('canvas').screenshot({ path: `${output}/hero.png`, scale: 'css', timeout: 120000 });
  await page.evaluate(() => window.setView('front'));
  await page.locator('canvas').screenshot({ path: `${output}/front.png`, scale: 'css', timeout: 120000 });
  const stats = await page.evaluate(() => window.sceneStats());
  await page.evaluate(() => { window.setInspection(true); window.setView('reference'); });
  await page.locator('canvas').screenshot({ path: `${output}/reference.png`, scale: 'css', timeout: 120000 });
  await page.evaluate(() => window.setInspection(false));
  const comparison = await browser.newPage({ viewport: { width: 1500, height: 700 }, deviceScaleFactor: 1 });
  await comparison.goto(`${server.resolvedUrls.local[0]}static.html`);
  const comparisonData = await comparison.evaluate(async paths => {
    // Align only translation and uniform scale; never warp the reference to fit.
    const tiles = [];
    const bounds = [];
    for (const path of paths) {
      const image = new Image();
      image.src = path;
      await image.decode();
      const source = document.createElement('canvas');
      source.width = image.naturalWidth; source.height = image.naturalHeight;
      const context = source.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, source.width, source.height).data;
      let left = source.width, right = 0, top = source.height, bottom = 0;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        if (pixels[i + 3] > 100 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 228) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      const width = right - left + 1, height = bottom - top + 1;
      bounds.push({ left, top, width, height, aspect: width / height });
      const tile = document.createElement('canvas');
      tile.width = 500; tile.height = 700;
      const target = tile.getContext('2d');
      const scale = Math.min(480 / width, 600 / height);
      target.drawImage(source, left, top, width, height, (500 - width * scale) / 2, (650 - height * scale) / 2, width * scale, height * scale);
      tiles.push(tile);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1500; canvas.height = 700;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1500, 700);
    ctx.drawImage(tiles[0], 0, 0); ctx.drawImage(tiles[1], 500, 0);
    ctx.globalAlpha = 0.48;
    ctx.drawImage(tiles[0], 1000, 0); ctx.drawImage(tiles[1], 1000, 0);
    ctx.globalAlpha = 1;
    ctx.font = '18px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#493f36';
    ['REF', '3D', 'OVERLAY'].forEach((label, i) => ctx.fillText(label, 250 + i * 500, 681));
    return { image: canvas.toDataURL('image/png').split(',')[1], bounds };
  }, ['/references/psyduck_official.png', `/${output}/reference.png`]);
  await writeFile(`${output}/comparison.png`, Buffer.from(comparisonData.image, 'base64'));
  stats.referenceBounds = comparisonData.bounds;
  await comparison.close();
  if (Number(round.slice(1)) >= 6 || round === 'final') {
    for (const view of ['side', 'back']) {
      await page.evaluate(view => window.setView(view), view);
      await page.locator('canvas').screenshot({ path: `${output}/${view}.png`, scale: 'css', timeout: 120000 });
    }
  }
  if (round === 'final') {
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await page.evaluate(() => window.exportModel());
    await (await downloadPromise).saveAs('psyduck_anime.glb');
    stats.export = await page.evaluate(() => window.validateExport());
    if (stats.export.texturedMeshes < 5 || stats.export.size[1] < 3) throw new Error('Incomplete GLB export');
    await page.evaluate(() => window.setView('hero'));
    const before = await page.evaluate(() => window.sceneStats());
    await page.mouse.move(size * 0.55, size * 0.50);
    await page.mouse.down();
    await page.mouse.move(size * 0.35, size * 0.52, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(before => window.sceneStats().camera.some((v, i) => Math.abs(v - before.camera[i]) > 0.1), before);
    await page.mouse.wheel(0, -200);
    await page.waitForFunction(before => window.sceneStats().zoom > before.zoom, before);
    stats.interaction = { orbit: true, zoom: true };
    await page.reload();
    await page.waitForFunction(() => window.renderReady, {}, { timeout: 120000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('canvas').screenshot({ path: `${output}/mobile.png`, scale: 'css', timeout: 120000 });
    await copyFile(`${output}/hero.png`, 'psyduck_anime.png');
    const sheet = await browser.newPage({ viewport: { width: 1800, height: Math.ceil(stats.round / 3) * 620 }, deviceScaleFactor: 1 });
    await sheet.setContent(`<html><head><style>body{margin:0;display:grid;grid-template-columns:repeat(3,600px);background:#e9e7de;font:18px monospace;color:#564f43}figure{margin:0;height:620px;text-align:center}img{width:600px;height:590px;object-fit:contain}figcaption{height:30px}</style></head><body>${Array.from({ length: stats.round }, (_, i) => `<figure><img src="${server.resolvedUrls.local[0]}iterations/r${String(i + 1).padStart(2, '0')}/hero.png"><figcaption>${String(i + 1).padStart(2, '0')}</figcaption></figure>`).join('')}</body></html>`);
    await sheet.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await sheet.screenshot({ path: 'iterations/contact_sheet.png' });
    await sheet.setViewportSize({ width: 1560, height: 650 });
    const comparisons = [['REF', 'references/psyduck_official.png'], ['06', 'iterations/r06/front.png'], [String(stats.round).padStart(2, '0'), `${output}/front.png`]];
    await sheet.setContent(`<html><head><style>body{margin:0;display:flex;background:#f5f1e4;font:20px monospace;color:#564f43}figure{margin:0;width:520px;height:650px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}section{height:620px;width:520px;display:flex;align-items:center;justify-content:center}img{width:520px;height:620px;object-fit:contain}figure:first-child img{width:auto;height:480px}figcaption{height:30px}</style></head><body>${comparisons.map(([label, path]) => `<figure><section><img src="${server.resolvedUrls.local[0]}${path}"></section><figcaption>${label}</figcaption></figure>`).join('')}</body></html>`);
    await sheet.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await sheet.screenshot({ path: 'references/comparison.png' });
    await sheet.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await copyFile('anime.js', `${output}/anime.js`);
  await writeFile(`${output}/checks.json`, JSON.stringify({ ...stats, browserErrors: errors }, null, 2));
  console.log(output, stats, 'No browser errors.');
} finally {
  await browser?.close();
  await server.close();
}
