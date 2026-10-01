import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startAppHarness } from '../helpers/app-harness.mjs';

let app;

before(async () => { app = await startAppHarness(); });
after(async () => { await app?.close(); });

test('settings exports a separate backup, previews it, saves a safety copy, and rejects invalid backups', async () => {
  const browserContext = await app.newContext('phase7-main.json', { defaultFilePickers: false, initScript: () => {
    const primaryName = 'phase7-main.json';
    let exportedBackupName = '';
    let safetyBackupName = '';
    let restoreFileName = primaryName;
    let failPrimaryWrites = false;
    let interceptedWrites = 0;
    const file = async (name) => (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
    const originalCreateWritable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      if (failPrimaryWrites && this.name === primaryName) {
        interceptedWrites += 1;
        throw new DOMException('Simulated main file write failure', 'NotAllowedError');
      }
      return originalCreateWritable.apply(this, args);
    };
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async (options = {}) => {
      if (options.suggestedName?.startsWith('工作生活备份-')) {
        exportedBackupName = options.suggestedName;
        return file(exportedBackupName);
      }
      if (options.suggestedName?.startsWith('恢复前安全备份-')) {
        safetyBackupName = options.suggestedName;
        return file(safetyBackupName);
      }
      return file(primaryName);
    } });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await file(restoreFileName)] });
    Object.defineProperty(window, '__selectExportedBackup', { configurable: true, value: () => { restoreFileName = exportedBackupName; } });
    Object.defineProperty(window, '__selectInvalidBackup', { configurable: true, value: () => { restoreFileName = 'invalid-backup.json'; } });
    Object.defineProperty(window, '__failPrimaryWrites', { configurable: true, value: (fail) => { failPrimaryWrites = fail; } });
    Object.defineProperty(window, '__interceptedWrites', { configurable: true, get: () => interceptedWrites });
    Object.defineProperty(window, '__safetyBackupName', { configurable: true, get: () => safetyBackupName });
  } });

  try {
    const page = await browserContext.newPage();
    await app.connect(page);
    const nav = page.getByRole('navigation', { name: '主导航' });
    await nav.getByRole('link', { name: '自媒体', exact: true }).click();
    await page.getByLabel('选题标题').fill('备份中的记录');
    await page.getByRole('button', { name: '添加内容' }).click();
    await page.getByText('备份中的记录', { exact: true }).waitFor();
    await page.getByLabel('数据文件状态：已保存 · phase7-main.json').waitFor();

    await page.getByRole('navigation', { name: '设置导航' }).getByRole('link', { name: '数据与设置', exact: true }).click();
    await page.getByRole('button', { name: '保存备份文件' }).click();
    await page.getByText(/独立备份已保存：工作生活备份-/).waitFor();

    await nav.getByRole('link', { name: '自媒体', exact: true }).click();
    await page.getByLabel('选题标题').fill('仅存在于恢复前');
    await page.getByRole('button', { name: '添加内容' }).click();
    await page.getByText('仅存在于恢复前', { exact: true }).waitFor();
    await page.getByLabel('数据文件状态：已保存 · phase7-main.json').waitFor();

    await page.getByRole('navigation', { name: '设置导航' }).getByRole('link', { name: '数据与设置', exact: true }).click();
    await page.evaluate(() => window.__selectExportedBackup());
    await page.getByRole('button', { name: '选择备份文件' }).click();
    const preview = page.getByRole('dialog', { name: '确认从备份恢复？' });
    await preview.waitFor();
    assert.equal(await preview.locator('.settings-count').filter({ hasText: '自媒体内容' }).locator('strong').textContent(), '1');
    await preview.getByRole('button', { name: '先保存安全备份，再恢复' }).click();
    await page.getByText(/恢复完成。恢复前的数据已另存为：恢复前安全备份-/).waitFor();
    await page.getByLabel('数据文件状态：已保存 · phase7-main.json').waitFor();

    const restored = await app.readData(page, 'phase7-main.json');
    assert.equal(restored.mediaItems.length, 1);
    assert.equal(restored.mediaItems[0].title, '备份中的记录');
    const safetyName = await page.evaluate(() => window.__safetyBackupName);
    assert.match(safetyName, /^恢复前安全备份-\d{8}-\d{6}\.json$/);
    const safety = await app.readData(page, safetyName);
    assert.deepEqual(safety.mediaItems.map((item) => item.title).sort(), ['仅存在于恢复前', '备份中的记录']);

    await page.evaluate(async () => {
      const handle = await (await navigator.storage.getDirectory()).getFileHandle('invalid-backup.json', { create: true });
      const writer = await handle.createWritable();
      await writer.write('{not-json');
      await writer.close();
      window.__selectInvalidBackup();
    });
    await page.getByRole('button', { name: '选择备份文件' }).click();
    await page.getByRole('alert').getByText('数据文件不是有效的 JSON。').waitFor();
    assert.equal((await app.readData(page, 'phase7-main.json')).mediaItems[0].title, '备份中的记录');

    await nav.getByRole('link', { name: '自媒体', exact: true }).click();
    await page.getByLabel('选题标题').fill('写入失败时仍保留');
    await page.getByRole('button', { name: '添加内容' }).click();
    await page.getByText('写入失败时仍保留', { exact: true }).waitFor();
    await page.getByLabel('数据文件状态：已保存 · phase7-main.json').waitFor();
    await page.getByRole('navigation', { name: '设置导航' }).getByRole('link', { name: '数据与设置', exact: true }).click();
    await page.evaluate(() => { window.__selectExportedBackup(); window.__failPrimaryWrites(true); });
    await page.getByRole('button', { name: '选择备份文件' }).click();
    const failedPreview = page.getByRole('dialog', { name: '确认从备份恢复？' });
    await failedPreview.waitFor();
    await failedPreview.getByRole('button', { name: '先保存安全备份，再恢复' }).click();
    await page.waitForFunction(() => window.__interceptedWrites > 0);
    const writeFailure = page.locator('.settings-feedback p[role="alert"]');
    await writeFailure.getByText(/恢复失败/).waitFor();
    assert.match(await writeFailure.textContent(), /安全备份已保存为/);
    const afterWriteFailure = await app.readData(page, 'phase7-main.json');
    assert.deepEqual(afterWriteFailure.mediaItems.map((item) => item.title).sort(), ['写入失败时仍保留', '备份中的记录']);
    await failedPreview.getByRole('button', { name: '取消' }).click();
    await nav.getByRole('link', { name: '自媒体', exact: true }).click();
    await page.getByText('2 条内容记录', { exact: true }).waitFor();
    await page.getByText('写入失败时仍保留', { exact: true }).waitFor();
    await browserContext.close();
  } finally {
    await browserContext.close();
  }
});
