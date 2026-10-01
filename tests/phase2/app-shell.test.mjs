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
  const address = vite.httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

after(async () => {
  await browser?.close();
  await vite?.close();
});

test('desktop shell exposes all nine destinations and stays on the local origin', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const externalRequests = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl);
  await page.getByRole('heading', { name: '首页总览' }).waitFor();

  const destinations = [
    ['首页总览', 'home'],
    ['今日计划', 'today'],
    ['自媒体', 'media'],
    ['开发工作', 'development'],
    ['咨询工作', 'consulting'],
    ['健身计划', 'fitness'],
    ['饮食计划', 'diet'],
    ['游戏娱乐', 'games'],
    ['数据与设置', 'settings'],
  ];

  for (const [label, route] of destinations) {
    const link = page.getByRole('link', { name: label });
    await link.click();
    assert.equal(new URL(page.url()).hash, `#${route}`, `${label} must have its own route`);
    await page.getByRole('heading', { name: label, level: 1 }).waitFor();
    assert.equal(await link.getAttribute('aria-current'), 'page', `${label} must be marked as the active page`);
  }

  assert.deepEqual(externalRequests, [], 'the shell must not fetch assets from the internet');
  assert.deepEqual(consoleErrors, [], 'the shell must not emit browser runtime errors');
  await context.close();
});

test('deep links restore the selected page after a fresh load', async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/#consulting`);
  await page.getByRole('heading', { name: '咨询工作', level: 1 }).waitFor();
  await page.close();
});

test('quick create asks for a record type and opens the matching module form', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const getHandle = async () => (await navigator.storage.getDirectory()).getFileHandle('quick-create-data.json', { create: true });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: getHandle });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await getHandle()] });
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  const quickCreate = page.getByRole('button', { name: '快速新增' });
  await quickCreate.waitFor();
  assert.equal(await quickCreate.isDisabled(), true, 'record creation stays unavailable until a data file is connected');
  await page.getByRole('button', { name: '创建新数据文件' }).click();
  await page.getByLabel(/数据文件状态：已保存/).waitFor();
  await quickCreate.click();
  const menu = page.getByRole('menu', { name: '选择新增类型' });
  await menu.getByRole('menuitem', { name: '新增自媒体内容' }).click();
  assert.equal(new URL(page.url()).hash, '#media');
  await page.getByLabel('选题标题').waitFor();
  await context.close();
});

test('manual save button writes the current snapshot to the connected data file', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const getHandle = async () => (await navigator.storage.getDirectory()).getFileHandle('manual-save-data.json', { create: true });
    const createWritable = FileSystemFileHandle.prototype.createWritable;
    let writes = 0;
    FileSystemFileHandle.prototype.createWritable = function (...args) {
      writes += 1;
      return createWritable.apply(this, args);
    };
    Object.defineProperty(window, '__fileWrites', { configurable: true, get: () => writes });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: getHandle });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await getHandle()] });
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '创建新数据文件' }).click();
  await page.getByLabel('数据文件状态：已保存 · manual-save-data.json').waitFor();
  const previousWrites = await page.evaluate(() => window.__fileWrites);
  await page.getByRole('button', { name: '手动保存数据文件' }).click();
  await page.waitForFunction((priorCount) => window.__fileWrites > priorCount, previousWrites);
  await page.getByLabel('数据文件状态：已保存 · manual-save-data.json').waitFor();
  assert.ok(await page.evaluate(() => window.__fileWrites) > previousWrites);
  await context.close();
});
