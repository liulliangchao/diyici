import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmptyData, parseAppData } from '../../src/storage/dataCodec.ts';
import { readBackupFile, saveBackupFile } from '../../src/storage/backup.ts';

function makeHandle(name, id = name, value = '') {
  return {
    name,
    id,
    value,
    async isSameEntry(other) { return this.id === other.id; },
    async getFile() {
      const handle = this;
      return { async text() { return handle.value; } };
    },
    async createWritable() {
      const handle = this;
      let next = '';
      return {
        async write(text) { next = text; },
        async close() { handle.value = next; },
        async abort() {},
      };
    },
  };
}

test('backup writes a validated complete copy to a separately chosen local file', async () => {
  const current = makeHandle('main.json', 'main');
  const backup = makeHandle('backup.json', 'backup');
  const data = createEmptyData(new Date('2026-09-30T02:00:00.000Z'));
  data.quickMemos.push({ id: 'memo-1', createdAt: data.createdAt, updatedAt: data.updatedAt, content: 'backup content' });
  let options;
  const result = await saveBackupFile(data, { async showSaveFilePicker(value) { options = value; return backup; } }, current);

  assert.equal(result, backup);
  assert.equal(options.types[0].accept['application/json'][0], '.json');
  assert.match(options.suggestedName, /^工作生活备份-\d{8}-\d{6}\.json$/);
  assert.deepEqual(parseAppData(backup.value), data);
  assert.equal(current.value, '');
});

test('backup refuses to overwrite the connected primary data file', async () => {
  const current = makeHandle('main.json', 'same');
  let writes = 0;
  const picker = { async showSaveFilePicker() { writes += 1; return makeHandle('selected.json', 'same'); } };

  await assert.rejects(saveBackupFile(createEmptyData(), picker, current), /必须与当前数据文件分开保存/);
  assert.equal(writes, 1);
});

test('restore reads a selected compatible backup without modifying either file', async () => {
  const current = makeHandle('main.json', 'main', 'keep main unchanged');
  const backupData = createEmptyData(new Date('2026-09-29T02:00:00.000Z'));
  const backup = makeHandle('backup.json', 'backup', JSON.stringify(backupData));
  let options;
  const result = await readBackupFile({ async showOpenFilePicker(value) { options = value; return [backup]; } }, current);

  assert.equal(result.handle, backup);
  assert.deepEqual(result.data, backupData);
  assert.equal(options.mode, 'read');
  assert.equal(current.value, 'keep main unchanged');
  assert.equal(backup.value, JSON.stringify(backupData));
});

test('restore rejects the current file, malformed JSON, and incompatible schema without touching current data', async () => {
  const current = makeHandle('main.json', 'main', 'original main contents');
  await assert.rejects(readBackupFile({ async showOpenFilePicker() { return [makeHandle('same-main.json', 'main')]; } }, current), /不能把当前主数据文件/);
  await assert.rejects(readBackupFile({ async showOpenFilePicker() { return [makeHandle('broken.json', 'broken', '{bad json')]; } }, current), /不是有效的 JSON/);
  const incompatible = createEmptyData();
  incompatible.schemaVersion = 999;
  await assert.rejects(readBackupFile({ async showOpenFilePicker() { return [makeHandle('old.json', 'old', JSON.stringify(incompatible))]; } }, current), /不受支持/);
  assert.equal(current.value, 'original main contents');
});
