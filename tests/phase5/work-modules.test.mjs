import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;

before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('media content moves through its workflow and saves platform and publish date', async () => {
  const context = await app.newContext('media-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '自媒体', exact: true }).click();

  await page.getByLabel('选题标题').fill('每周工作复盘');
  await page.getByLabel('发布平台').fill('公众号');
  await page.getByLabel('内容形式').fill('图文');
  await page.getByLabel('计划发布日期').fill('2026-10-02');
  await page.getByRole('button', { name: '添加内容' }).click();
  await page.getByText('每周工作复盘', { exact: true }).waitFor();
  await page.getByLabel('更新阶段：每周工作复盘').selectOption('producing');
  await page.getByLabel('数据文件状态：已保存 · media-flow.json').waitFor();

  await page.getByText('编辑详情', { exact: true }).click();
  await page.getByLabel('编辑内容标题：每周工作复盘').fill('我的每周复盘');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('我的每周复盘', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · media-flow.json').waitFor();

  const document = await app.readData(page, 'media-flow.json');
  assert.equal(document.mediaItems.length, 1);
  assert.equal(document.mediaItems[0].title, '我的每周复盘');
  assert.equal(document.mediaItems[0].stage, 'producing');
  assert.equal(document.mediaItems[0].platform, '公众号');
  assert.equal(document.mediaItems[0].plannedPublishDate, '2026-10-02');
  await context.close();
});

test('development work is organized by project and supports blocked task status', async () => {
  const context = await app.newContext('development-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '开发工作', exact: true }).click();

  await page.getByLabel('新项目名称').fill('个人效率工具');
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: /个人效率工具 0 项待完成/ }).waitFor();
  await page.getByLabel('开发事项标题').fill('修复文件授权状态');
  await page.getByLabel('开发截止日期').fill('2026-10-03');
  await page.getByRole('button', { name: '添加事项' }).click();
  await page.getByText('修复文件授权状态', { exact: true }).waitFor();
  await page.getByLabel('开发事项状态：修复文件授权状态').selectOption('blocked');
  await page.locator('.stage-pill.task-blocked').waitFor();
  await page.getByLabel('数据文件状态：已保存 · development-flow.json').waitFor();

  const document = await app.readData(page, 'development-flow.json');
  assert.equal(document.developmentProjects.length, 1);
  assert.equal(document.developmentTasks.length, 1);
  assert.equal(document.developmentTasks[0].projectId, document.developmentProjects[0].id);
  assert.equal(document.developmentTasks[0].status, 'blocked');
  assert.equal(document.developmentTasks[0].dueDate, '2026-10-03');
  await context.close();
});

test('consulting records belong to clients and follow-ups can be completed', async () => {
  const context = await app.newContext('consulting-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '咨询工作', exact: true }).click();

  await page.getByLabel('新客户名称').fill('林先生');
  await page.getByRole('button', { name: '添加客户' }).click();
  await page.getByText('林先生 · 咨询记录', { exact: true }).waitFor();
  await page.getByLabel('咨询主题').fill('产品定位讨论');
  await page.getByLabel('下次跟进日期').fill('2026-10-05');
  await page.getByLabel('沟通摘要').fill('整理目标用户和第一版边界');
  await page.getByRole('button', { name: '保存咨询记录' }).click();
  await page.getByText('待跟进 · 10月5日').waitFor();
  await page.getByRole('button', { name: '标记完成' }).click();
  await page.getByText('已完成跟进').waitFor();
  await page.getByText('0', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · consulting-flow.json').waitFor();

  const document = await app.readData(page, 'consulting-flow.json');
  assert.equal(document.clients.length, 1);
  assert.equal(document.consultations.length, 1);
  assert.equal(document.consultations[0].clientId, document.clients[0].id);
  assert.equal(document.consultations[0].followUpStatus, 'done');
  assert.equal(document.consultations[0].followUpDate, '2026-10-05');
  await context.close();
});
