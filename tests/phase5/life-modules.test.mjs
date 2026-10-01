import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;
before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('fitness plans store multiple exercises and actual completion records', async () => {
  const context = await app.newContext('fitness-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '健身计划', exact: true }).click();

  await page.getByLabel('训练名称').fill('力量训练');
  await page.getByLabel('动作部位 1').selectOption('臀腿');
  await page.getByLabel('动作名称 1').fill('深蹲');
  await page.getByLabel('动作组数 1').fill('4');
  await page.getByLabel('动作次数 1').fill('8');
  await page.getByLabel('动作重量 1').fill('40');
  await page.getByRole('button', { name: '添加动作' }).click();
  await page.getByLabel('动作部位 2').selectOption('背部');
  await page.getByLabel('动作名称 2').fill('硬拉');
  await page.getByLabel('动作组数 2').fill('3');
  await page.getByLabel('动作次数 2').fill('6');
  await page.getByRole('button', { name: '保存训练安排' }).click();
  await page.getByText('力量训练', { exact: true }).waitFor();
  await page.getByRole('gridcell', { name: /臀腿、背部/ }).waitFor();
  await page.getByLabel('标记训练完成：力量训练').click();
  await page.getByLabel('数据文件状态：已保存 · fitness-flow.json').waitFor();

  await page.locator('.exercise-row').first().getByText('编辑动作', { exact: true }).click();
  await page.getByLabel('编辑动作名称：深蹲').fill('杠铃深蹲');
  await page.getByRole('button', { name: '保存动作' }).click();
  await page.getByText('杠铃深蹲', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · fitness-flow.json').waitFor();

  const document = await app.readData(page, 'fitness-flow.json');
  assert.equal(document.workouts.length, 1);
  assert.equal(document.workouts[0].completed, true);
  assert.equal(document.workouts[0].exercises.length, 2);
  assert.equal(document.workouts[0].exercises[0].name, '杠铃深蹲');
  assert.equal(document.workouts[0].exercises[0].bodyPart, '臀腿');
  assert.equal(document.workouts[0].exercises[0].sets, 4);
  assert.equal(document.workouts[0].exercises[1].name, '硬拉');
  await context.close();
});

test('diet records group meals by date and support editing meal details', async () => {
  const context = await app.newContext('diet-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '饮食计划', exact: true }).click();
  const selectedCalendarDay = page.locator('.calendar-day[aria-pressed="true"]');
  await selectedCalendarDay.waitFor();
  assert.match(await selectedCalendarDay.getAttribute('aria-label'), /未记录饮食/);

  await page.getByLabel('餐次').selectOption('lunch');
  await page.getByLabel('饮食内容').fill('鸡肉饭和青菜');
  await page.getByLabel('饮食备注').fill('午餐');
  await page.getByRole('button', { name: '保存饮食记录' }).click();
  await page.getByText('鸡肉饭和青菜', { exact: true }).waitFor();
  await page.locator('.meal-type-pill').filter({ hasText: '午餐' }).waitFor();
  await page.getByLabel('餐食记录日期').waitFor();
  await page.waitForFunction(() => document.querySelector('.calendar-day[aria-pressed="true"]')?.getAttribute('aria-label')?.includes('饮食记录：午餐'));
  await page.getByText('编辑记录', { exact: true }).click();
  await page.getByLabel('编辑饮食内容：鸡肉饭和青菜').fill('鸡肉饭、青菜和水果');
  await page.getByRole('button', { name: '保存修改' }).click();
  await page.getByText('鸡肉饭、青菜和水果', { exact: true }).waitFor();
  await page.getByLabel('数据文件状态：已保存 · diet-flow.json').waitFor();

  const document = await app.readData(page, 'diet-flow.json');
  assert.equal(document.meals.length, 1);
  assert.equal(document.meals[0].mealType, 'lunch');
  assert.equal(document.meals[0].content, '鸡肉饭、青菜和水果');
  assert.equal(document.meals[0].notes, '午餐');
  await context.close();
});

test('game library tracks status and a dated play session with duration', async () => {
  const context = await app.newContext('games-flow.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '游戏娱乐', exact: true }).click();

  await page.getByLabel('游戏名称').fill('山海旅人');
  await page.getByLabel('游戏平台').fill('PC');
  await page.getByLabel('初始游玩状态').selectOption('playing');
  await page.getByRole('button', { name: '添加游戏' }).click();
  await page.getByText('山海旅人', { exact: true }).waitFor();
  await page.getByRole('button', { name: '＋ 记录游玩' }).click();
  await page.getByLabel('游玩时长：山海旅人').fill('45');
  await page.getByLabel('游玩备注：山海旅人').fill('推进到第二章');
  await page.getByRole('button', { name: '保存记录' }).click();
  await page.getByText('45 分钟', { exact: true }).waitFor();
  await page.getByLabel('游戏状态：山海旅人').selectOption('finished');
  await page.getByLabel('数据文件状态：已保存 · games-flow.json').waitFor();

  const document = await app.readData(page, 'games-flow.json');
  assert.equal(document.games.length, 1);
  assert.equal(document.games[0].status, 'finished');
  assert.equal(document.games[0].platform, 'PC');
  assert.equal(document.playSessions.length, 1);
  assert.equal(document.playSessions[0].gameId, document.games[0].id);
  assert.equal(document.playSessions[0].durationMinutes, 45);
  assert.equal(document.playSessions[0].notes, '推进到第二章');
  await context.close();
});
