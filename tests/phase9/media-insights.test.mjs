import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;
before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('the empty media insights panel creates a published video directly and visualizes all five measures', async () => {
  const context = await app.newContext('media-insights.json');
  const page = await context.newPage();
  await app.connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '自媒体', exact: true }).click();
  await page.getByLabel('首次统计视频标题').waitFor();
  await page.screenshot({ fullPage: true, path: join(tmpdir(), 'personal-work-life-media-first-entry-review.png') });

  const dates = await page.evaluate(() => {
    const result = [];
    for (const offset of [2, 1]) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      result.push(`${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`);
    }
    return result;
  });
  const inputCounts = async (counts) => {
    const labels = ['播放量', '点赞', '评论', '收藏', '分享'];
    for (let index = 0; index < labels.length; index += 1) await page.getByLabel(`视频${labels[index]}`).fill(String(counts[index]));
  };

  await page.getByLabel('首次统计视频标题').fill('数据统计视频');
  await page.getByLabel('首次统计日期').fill(dates[0]);
  await inputCounts([1000, 52, 8, 20, 11]);
  await page.getByRole('button', { name: '创建视频并保存数据', exact: true }).click();
  await page.getByLabel('数据文件状态：已保存 · media-insights.json').waitFor();
  await page.getByLabel('选择已发布视频').waitFor();
  assert.equal(await page.getByRole('img', { name: '播放量趋势图' }).locator('.chart-dot').count(), 1);

  await page.getByLabel('视频数据日期').fill(dates[1]);
  await inputCounts([1600, 80, 14, 34, 19]);
  await page.getByRole('button', { name: '保存数据', exact: true }).click();
  await page.getByLabel('数据文件状态：已保存 · media-insights.json').waitFor();

  await page.getByLabel('视频数据日期').fill(dates[1]);
  await inputCounts([1750, 84, 15, 36, 21]);
  await page.getByRole('button', { name: '保存数据', exact: true }).click();
  await page.getByLabel('数据文件状态：已保存 · media-insights.json').waitFor();
  const chart = page.getByRole('img', { name: '播放量趋势图' });
  assert.equal(await chart.locator('.chart-dot').count(), 2);
  assert.equal(await page.locator('.media-metric-card').filter({ hasText: '播放量' }).locator('strong').textContent(), '1,750');
  await page.getByRole('button', { name: /点赞/ }).click();
  await page.getByRole('img', { name: '点赞趋势图' }).waitFor();
  assert.equal(await page.locator('.media-metric-card').filter({ hasText: '点赞' }).locator('strong').textContent(), '84');
  await page.screenshot({ fullPage: true, path: join(tmpdir(), 'personal-work-life-media-metrics-review.png') });

  const document = await app.readData(page, 'media-insights.json');
  const snapshots = document.mediaItems[0].metricsSnapshots;
  assert.equal(snapshots.length, 2, 'saving twice for a date updates that date instead of duplicating it');
  assert.deepEqual(snapshots.map(({ views, likes, comments, saves, shares }) => ({ views, likes, comments, saves, shares })), [
    { views: 1000, likes: 52, comments: 8, saves: 20, shares: 11 },
    { views: 1750, likes: 84, comments: 15, saves: 36, shares: 21 },
  ]);
  await context.close();
});
