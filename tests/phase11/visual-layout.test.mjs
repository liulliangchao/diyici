import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;
before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('work and life areas have distinct page treatments and readable month calendars', async () => {
  const context = await app.newContext('visual-layout.json');
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await app.connect(page);

  const shellColors = await page.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(shellColors.sidebar, 'rgb(32, 59, 50)');
  assert.equal(shellColors.page, 'rgb(242, 241, 233)');

  const pageIdentities = [
    ['自媒体', '.media-intro-band'],
    ['开发工作', '.development-hero'],
    ['咨询工作', '.followup-card'],
    ['健身计划', '.month-calendar-fitness'],
    ['饮食计划', '.month-calendar-diet'],
    ['游戏娱乐', '.games-hero'],
  ];
  for (const [label, selector] of pageIdentities) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: label, exact: true }).click();
    await page.locator(selector).waitFor();
    const horizontalOverflow = await page.locator('.page-content').evaluate((element) => element.scrollWidth > element.clientWidth);
    assert.equal(horizontalOverflow, false, `${label} should fit a desktop content area without horizontal overflow`);
  }

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '饮食计划', exact: true }).click();
  const calendarColumns = await page.locator('.diet-calendar-panel .calendar-days').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(calendarColumns, 7, 'the diet month view must keep seven weekday columns');
  await page.screenshot({ fullPage: true, path: join(tmpdir(), 'personal-work-life-diet-calendar-review.png') });
  await context.close();
});
