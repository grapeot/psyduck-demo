import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', console.error);
  page.on('console', m => { if (m.type() === 'error') console.log(m.text()); });
  page.on('worker', w => w.on('close', () => console.log('Worker closed')));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const ctx = c.getContext('2d'); let i = 0;
      setInterval(() => { ctx.fillStyle = ++i % 2 ? '#ffffff' : '#eeeeee'; ctx.fillRect(0, 0, 320, 240); }, 100);
      return c.captureStream(10);
    };
  });
  await page.goto(server.resolvedUrls.local[0]); await page.waitForFunction(() => window.renderReady);
  await page.locator('#start').click();
  await page.waitForFunction(() => window.psyduck.controller.session?.lastTimestamp > 0 || !document.getElementById('start').hidden, {}, { timeout: 45000 });
  const state = await page.evaluate(() => ({ status: document.getElementById('status').textContent, timestamp: window.psyduck.controller.session?.lastTimestamp }));
  console.log(state); assert.ok(state.timestamp > 0); await page.locator('#stop').click();
} finally { await browser.close(); await server.close(); }
