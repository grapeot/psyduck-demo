import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.argv[2];
assert.ok(url, 'Pass the running app URL as the first argument');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const oldTimeout of [true, false]) {
    const context = await browser.newContext();
    let delayed = 0;
    const pending = [];
    const failures = [];
    context.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
    await context.route(/vision_wasm.*\.wasm/, route => {
      delayed++;
      const task = new Promise(resolve => setTimeout(resolve, 35000)).then(async () => {
        try { await route.continue(); }
        catch (error) { if (!oldTimeout) throw error; }
      });
      pending.push(task);
      return task;
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        let frame = 0;
        window.syntheticTimer = setInterval(() => {
          ctx.fillStyle = ++frame % 2 ? '#ffffff' : '#eeeeee';
          ctx.fillRect(0, 0, 320, 240);
        }, 100);
        return canvas.captureStream(10);
      };
    });
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.renderReady);
      if (oldTimeout) await page.evaluate(() => { window.psyduck.controller.initTimeout = 30000; });
      const started = Date.now();
      await page.locator('#start').click();
      await page.waitForFunction(() => window.psyduck.controller.session?.lastTimestamp > 0
        || !document.getElementById('start').hidden, {}, { timeout: 90000 });
      const state = await page.evaluate(() => ({ status: document.getElementById('status').textContent,
        timestamp: window.psyduck.controller.session?.lastTimestamp ?? null,
        initTimeout: window.psyduck.controller.initTimeout, secureContext: isSecureContext }));
      assert.equal(delayed, 1);
      if (oldTimeout) assert.equal(state.timestamp, null);
      else { assert.ok(state.timestamp > 0); assert.deepEqual(failures, []); }
      console.log(JSON.stringify({ oldTimeout, delayedWasmMs: 35000, elapsedMs: Date.now() - started, ...state, failures }));
      await page.evaluate(() => { window.psyduck.controller.stop(); clearInterval(window.syntheticTimer); });
    } finally {
      await context.close();
      await Promise.all(pending);
    }
  }
} finally { await browser.close(); }
