import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
await mkdir('public/models', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error(e));
  await page.goto(`${server.resolvedUrls.local[0]}rig-builder.html`);
  await page.waitForFunction(() => window.generate);
  const download = page.waitForEvent('download');
  await page.evaluate(() => window.generate());
  await (await download).saveAs('public/models/psyduck_rigged.glb');
  console.log('Exported public/models/psyduck_rigged.glb');
} finally { await browser.close(); await server.close(); }
