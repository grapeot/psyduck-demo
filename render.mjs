import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto(`${server.resolvedUrls.local[0]}static.html`);
  await page.waitForFunction(() => window.renderReady === true, { }, { timeout: 120000 });
  console.log('Scene rendered.');
  await page.locator('canvas').screenshot({ path: 'psyduck_realistic.png', scale: 'css', timeout: 120000 });
  console.log('Desktop screenshot saved.');
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate(() => window.exportModel());
  const download = await downloadPromise;
  await download.saveAs('psyduck_realistic.glb');
  console.log('Desktop render:', await page.evaluate(() => window.sceneStats()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 780);
  await page.locator('canvas').screenshot({ path: 'psyduck_realistic_mobile.png', scale: 'css', timeout: 120000 });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Saved psyduck_realistic.png, psyduck_realistic_mobile.png, psyduck_realistic.glb. No browser errors.');
} finally {
  await browser?.close();
  await server.close();
}
