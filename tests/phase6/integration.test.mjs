import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;

before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('home memos and cross-module agenda links stay synchronized with source data', async () => {
  const context = await app.newContext('phase6-integration.json');
  const page = await context.newPage();
  await app.connect(page);

  const nav = page.getByRole('navigation', { name: '主导航' });
  const futureDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  });

  await nav.getByRole('link', { name: '自媒体', exact: true }).click();
  await page.getByLabel('选题标题').fill('阶段六联动验证');
  await page.getByLabel('当前阶段').selectOption('ready');
  await page.getByLabel('计划发布日期').fill(futureDate);
  await page.getByRole('button', { name: '添加内容' }).click();
  await page.getByText('阶段六联动验证', { exact: true }).waitFor();

  await nav.getByRole('link', { name: '首页总览', exact: true }).click();
  await page.getByText('1', { exact: true }).first().waitFor();
  await page.getByLabel('快速备忘内容').fill('记得检查内容发布流程');
  await page.getByRole('button', { name: '记下来' }).click();
  await page.locator('.memo-copy p').getByText('记得检查内容发布流程', { exact: true }).waitFor();
  await page.getByText('编辑', { exact: true }).click();
  await page.getByLabel('编辑备忘：记得检查内容发布流程').fill('检查内容发布和恢复流程');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.locator('.memo-copy p').getByText('检查内容发布和恢复流程', { exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('删除备忘：检查内容发布和恢复流程').click();
  await page.locator('.memo-copy p').getByText('检查内容发布和恢复流程', { exact: true }).waitFor({ state: 'detached' });

  await nav.getByRole('link', { name: '今日计划', exact: true }).click();
  const sourceEvent = page.getByLabel('关联模块记录');
  await sourceEvent.selectOption({ label: `${futureDate} · 自媒体发布 · 阶段六联动验证` });
  assert.equal(await page.getByLabel('查看日期').inputValue(), futureDate);
  await page.getByRole('button', { name: /添加计划/ }).click();
  await page.getByText('关联模块', { exact: true }).waitFor();
  await page.getByText('阶段六联动验证', { exact: true }).waitFor();
  await page.getByLabel('标记完成：阶段六联动验证').click();
  await page.getByLabel('取消完成：阶段六联动验证').waitFor();

  await nav.getByRole('link', { name: '自媒体', exact: true }).click();
  await page.getByLabel('更新阶段：阶段六联动验证').selectOption('published');
  await page.getByLabel('数据文件状态：已保存 · phase6-integration.json').waitFor();

  const document = await app.readData(page, 'phase6-integration.json');
  assert.equal(document.mediaItems[0].stage, 'published');
  assert.equal(document.planItems.length, 1);
  assert.deepEqual(document.planItems[0].linkedRecord, { type: 'media', id: document.mediaItems[0].id });
  assert.equal(document.planItems[0].completed, true);
  assert.equal(document.quickMemos.length, 0);
  await context.close();
});
