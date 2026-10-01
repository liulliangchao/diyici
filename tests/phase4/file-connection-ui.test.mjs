import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite;
let browser;
let baseUrl;

before(async () => {
  vite = await createViteServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await vite.listen();
  baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

after(async () => {
  await browser?.close();
  await vite?.close();
});

test('the UI creates a local data file and reconnects it after a page restart', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const getTestHandle = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle('phase4-app-data.json', { create: true });
    };
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: getTestHandle });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [await getTestHandle()],
    });
  });

  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: '先连接你的数据文件' }).waitFor();
  await page.getByRole('button', { name: '创建新数据文件' }).click();
  await page.getByLabel('数据文件状态：已保存 · phase4-app-data.json').waitFor();

  const storedData = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('phase4-app-data.json');
    return JSON.parse(await (await handle.getFile()).text());
  });
  assert.equal(storedData.schemaVersion, 1);
  assert.deepEqual(storedData.planItems, []);
  assert.deepEqual(storedData.games, []);

  await page.reload();
  const reauthorization = page.getByRole('button', { name: '重新授权' });
  if (await reauthorization.isVisible().catch(() => false)) {
    await reauthorization.click();
  }
  await page.getByLabel('数据文件状态：已保存 · phase4-app-data.json').waitFor();
  await context.close();
});

test('unsupported file picker state explains the supported browser requirement', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: '当前浏览器不支持直接保存文件' }).waitFor();
  await page.getByText(/最新版 Microsoft Edge 或 Google Chrome/).waitFor();
  await context.close();
});
