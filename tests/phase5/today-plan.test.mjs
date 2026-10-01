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

test('today plan supports add, complete, edit, delete, date view, and file persistence', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const getHandle = async () => (await navigator.storage.getDirectory()).getFileHandle('today-plan.json', { create: true });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: getHandle });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await getHandle()] });
  });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '创建新数据文件' }).click();
  await page.getByLabel(/数据文件状态：已保存/).waitFor();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '今日计划', exact: true }).click();

  const selectedDate = await page.getByLabel('查看日期').inputValue();
  await page.getByLabel('计划内容').fill('写 PRD 初稿');
  await page.getByLabel('计划时间').fill('09:30');
  await page.getByLabel('所属领域').selectOption('开发');
  await page.getByLabel('计划备注').fill('先完成目录和验收项');
  await page.getByRole('button', { name: /添加计划/ }).click();
  await page.getByText('写 PRD 初稿', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · today-plan.json').waitFor();

  await page.getByLabel('标记完成：写 PRD 初稿').click();
  await page.getByLabel('取消完成：写 PRD 初稿').waitFor();
  await page.getByLabel('数据文件状态：已保存 · today-plan.json').waitFor();

  await page.getByText('编辑', { exact: true }).click();
  await page.getByLabel('编辑计划内容：写 PRD 初稿').fill('整理 PRD 草稿');
  await page.getByLabel('编辑备注：写 PRD 初稿').fill('先完成目录、验收项和页面流程');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('整理 PRD 草稿', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · today-plan.json').waitFor();

  await page.getByLabel('计划内容', { exact: true }).fill('临时电话');
  await page.getByRole('button', { name: /添加计划/ }).click();
  await page.getByText('临时电话', { exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('删除计划：临时电话').click();
  await page.getByText('临时电话', { exact: true }).waitFor({ state: 'detached' });
  await page.getByLabel('数据文件状态：已保存 · today-plan.json').waitFor();

  await page.reload();
  const reauthorize = page.getByRole('button', { name: '重新授权' });
  if (await reauthorize.isVisible().catch(() => false)) await reauthorize.click();
  await page.getByLabel('数据文件状态：已保存 · today-plan.json').waitFor();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '今日计划', exact: true }).click();
  await page.getByText('整理 PRD 草稿', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('取消完成：整理 PRD 草稿').getAttribute('aria-pressed'), 'true');

  const document = await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('today-plan.json');
    return JSON.parse(await (await handle.getFile()).text());
  });
  assert.equal(document.planItems.length, 1);
  assert.equal(document.planItems[0].date, selectedDate);
  assert.equal(document.planItems[0].title, '整理 PRD 草稿');
  assert.equal(document.planItems[0].completed, true);
  assert.equal(document.planItems[0].notes, '先完成目录、验收项和页面流程');
  await context.close();
});
