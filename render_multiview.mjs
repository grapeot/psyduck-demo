import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';

const label = process.argv[2] || 'mv00';
if (!/^mv[a-z0-9_]+$/.test(label)) throw new Error('Expected multiview artifact id');
const output = `iterations/${label}`;
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
const views = [
  { id: 'front', camera: 'ortho_front', reference: 'references/psyduck_global_link.png', pose: 'neutral' },
  { id: 'side', camera: 'ortho_side', reference: 'references/dimensions_views.jpg', crop: [742, 163, 365, 382], pose: 'neutral' },
  { id: 'back', camera: 'ortho_back', reference: 'references/dimensions_views.jpg', crop: [454, 163, 266, 382], pose: 'neutral' },
  { id: 'quarter', camera: 'reference', reference: 'references/psyduck_official.png', pose: 'artwork' },
];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const final = label === 'mv_final';
  const size = final ? 1200 : 1000;
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: final ? 2 : 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  let pose;
  let exportCheck;
  for (const view of views) {
    if (pose !== view.pose) {
      pose = view.pose;
      await page.goto(`${server.resolvedUrls.local[0]}static.html${pose === 'neutral' ? '?neutral' : ''}`);
      await page.waitForFunction(() => window.renderReady, {}, { timeout: 120000 });
      await page.evaluate(() => window.setInspection(true));
    }
    await page.evaluate(view => window.setView(view), view.camera);
    await page.locator('canvas').screenshot({ path: `${output}/${view.id}.png`, scale: 'css', timeout: 120000 });
    if (final && view.id === 'front') {
      const download = page.waitForEvent('download', { timeout: 120000 });
      await page.evaluate(() => window.exportModel());
      await (await download).saveAs('psyduck_neutral.glb');
      exportCheck = await page.evaluate(() => window.validateExport('/psyduck_neutral.glb'));
      if (exportCheck.texturedMeshes < 5) throw new Error('Neutral texture export incomplete');
    }
  }
  const board = await page.evaluate(async ({ views, output }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bounds = {};
    for (let index = 0; index < views.length; index++) {
      const view = views[index];
      const ox = index % 2 * 800, oy = Math.floor(index / 2) * 660;
      bounds[view.id] = [];
      for (let version = 0; version < 2; version++) {
        const image = new Image();
        image.src = '/' + (version === 0 ? view.reference : `${output}/${view.id}.png`);
        await image.decode();
        const source = document.createElement('canvas');
        const crop = version === 0 && view.crop ? view.crop : [0, 0, image.naturalWidth, image.naturalHeight];
        source.width = crop[2]; source.height = crop[3];
        const sc = source.getContext('2d');
        sc.fillStyle = 'white'; sc.fillRect(0, 0, source.width, source.height);
        sc.drawImage(image, ...crop, 0, 0, source.width, source.height);
        const data = sc.getImageData(0, 0, source.width, source.height).data;
        let x0 = source.width, y0 = source.height, x1 = 0, y1 = 0;
        for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
          const i = (y * source.width + x) * 4;
          if (Math.min(data[i], data[i + 1], data[i + 2]) < 225) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        const width = x1 - x0 + 1, height = y1 - y0 + 1;
        const scale = Math.min(375 / width, 570 / height);
        bounds[view.id].push({ width, height, aspect: width / height });
        ctx.drawImage(source, x0, y0, width, height, ox + version * 400 + (400 - width * scale) / 2, oy + (610 - height * scale) / 2, width * scale, height * scale);
      }
      ctx.fillStyle = '#494139'; ctx.font = '18px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${view.id.toUpperCase()} / REF`, ox + 200, oy + 635);
      ctx.fillText(`${view.id.toUpperCase()} / 3D`, ox + 600, oy + 635);
    }
    return { data: canvas.toDataURL('image/png').split(',')[1], bounds };
  }, { views, output });
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/comparison.png`, Buffer.from(board.data, 'base64'));
  await writeFile(`${output}/checks.json`, JSON.stringify({ label, views, bounds: board.bounds, export: exportCheck, browserErrors: errors }, null, 2));
  if (final) {
    const image = await page.evaluate(async ({ output, views }) => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1680;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 1680);
      for (let i = 0; i < views.length; i++) {
        const img = new Image(); img.src = `/${output}/${views[i].id}.png`; await img.decode();
        const x = i % 2 * 800, y = Math.floor(i / 2) * 840;
        ctx.drawImage(img, x, y, 800, 800); ctx.fillStyle = '#574c3d'; ctx.font = '20px monospace'; ctx.textAlign = 'center'; ctx.fillText(views[i].id.toUpperCase(), x + 400, y + 821);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { output, views });
    await writeFile('psyduck_views.png', Buffer.from(image, 'base64'));
  }
  await copyFile('anime.js', `${output}/anime.js`);
  console.log(output, 'four views rendered; no browser errors.');
} finally {
  await browser?.close();
  await server.close();
}
