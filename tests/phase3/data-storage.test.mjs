import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import { createEmptyData, parseAppData, serializeAppData } from '../../src/storage/dataCodec.ts';
import { enqueueDataFileWrite, readDataFile, writeDataFile } from '../../src/storage/fileData.ts';
import { forgetFileHandle, recallFileHandle, rememberFileHandle } from '../../src/storage/fileHandleStore.ts';

const databaseNames = new Set();

function makeMemoryHandle(initial = '') {
  return {
    name: 'work-life-data.json',
    value: initial,
    writes: 0,
    aborts: 0,
    failOnWrite: false,
    async getFile() {
      return { async text() { return this.parent.value; }, parent: this };
    },
    async createWritable() {
      const handle = this;
      return {
        async write(text) {
          if (handle.failOnWrite) throw new Error('disk full');
          handle.value = text;
          handle.writes += 1;
        },
        async close() {},
        async abort() { handle.aborts += 1; },
      };
    },
  };
}

function newDatabaseName() {
  const name = `phase3-${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
}

after(async () => {
  for (const databaseName of databaseNames) {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    });
  }
});

test('new data has every module collection and survives JSON round-trip', () => {
  const data = createEmptyData(new Date('2026-09-30T08:00:00.000Z'));
  const restored = parseAppData(serializeAppData(data));
  assert.equal(restored.schemaVersion, 1);
  assert.deepEqual(restored, data);
  assert.deepEqual(Object.keys(restored).filter((key) => Array.isArray(restored[key])), [
    'planItems', 'quickMemos', 'mediaItems', 'developmentProjects', 'developmentTasks',
    'clients', 'consultations', 'workouts', 'meals', 'games', 'playSessions',
  ]);
});

test('data validation rejects malformed JSON, unknown schema versions, and broken references', () => {
  assert.throws(() => parseAppData('{'), /有效的 JSON/);
  assert.throws(() => parseAppData('{"schemaVersion":99}'), /不受支持/);

  const invalidDate = createEmptyData();
  invalidDate.meals.push({
    id: 'meal-1', date: '2026-02-31', mealType: 'lunch', content: '午饭',
    createdAt: invalidDate.createdAt, updatedAt: invalidDate.updatedAt,
  });
  assert.throws(() => serializeAppData(invalidDate), /有效的 YYYY-MM-DD 日期/);

  const broken = createEmptyData();
  broken.developmentTasks.push({
    id: 'task-1', projectId: 'missing-project', title: '修复问题', status: 'todo',
    createdAt: broken.createdAt, updatedAt: broken.updatedAt,
  });
  assert.throws(() => serializeAppData(broken), /关联的项目不存在/);
});

test('file adapter writes a complete JSON document and reads it back', async () => {
  const handle = makeMemoryHandle();
  const data = createEmptyData(new Date('2026-09-30T08:00:00.000Z'));
  await writeDataFile(handle, data);
  assert.equal(handle.writes, 1);
  assert.match(handle.value, /"schemaVersion": 1/);
  assert.deepEqual(await readDataFile(handle), data);
});

test('write failure aborts the file stream and remains visible to the caller', async () => {
  const handle = makeMemoryHandle();
  handle.failOnWrite = true;
  await assert.rejects(writeDataFile(handle, createEmptyData()), /disk full/);
  assert.equal(handle.aborts, 1);
});

test('concurrent file writes are serialized and the newest snapshot wins', async () => {
  const handle = makeMemoryHandle();
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  let activeWriters = 0;
  let maximumActiveWriters = 0;
  const originalCreateWritable = handle.createWritable.bind(handle);
  handle.createWritable = async () => {
    const writer = await originalCreateWritable();
    return {
      async write(text) {
        activeWriters += 1;
        maximumActiveWriters = Math.max(maximumActiveWriters, activeWriters);
        if (text.includes('first snapshot')) {
          markFirstStarted();
          await new Promise((resolve) => { releaseFirst = resolve; });
        }
        await writer.write(text);
        activeWriters -= 1;
      },
      async close() { await writer.close(); },
      async abort() { await writer.abort(); activeWriters -= 1; },
    };
  };

  const first = createEmptyData();
  first.quickMemos.push({ id: 'memo-1', content: 'first snapshot', createdAt: first.createdAt, updatedAt: first.updatedAt });
  const second = createEmptyData();
  second.quickMemos.push({ id: 'memo-2', content: 'second snapshot', createdAt: second.createdAt, updatedAt: second.updatedAt });

  const firstWrite = enqueueDataFileWrite(handle, first);
  await firstStarted;
  const secondWrite = enqueueDataFileWrite(handle, second);
  releaseFirst();
  await Promise.all([firstWrite, secondWrite]);

  assert.equal(maximumActiveWriters, 1);
  assert.match(handle.value, /second snapshot/);
});

test('invalid existing JSON is rejected without attempting to overwrite it', async () => {
  const handle = makeMemoryHandle('{broken');
  await assert.rejects(readDataFile(handle), /有效的 JSON/);
  assert.equal(handle.value, '{broken');
  assert.equal(handle.writes, 0);
});

test('primary file handle can be remembered, recalled, and forgotten in IndexedDB', async () => {
  const databaseName = newDatabaseName();
  const handle = { kind: 'file', name: 'work-life-data.json', token: 'test-handle' };
  await rememberFileHandle(handle, indexedDB, databaseName);
  assert.deepEqual(await recallFileHandle(indexedDB, databaseName), handle);
  await forgetFileHandle(indexedDB, databaseName);
  assert.equal(await recallFileHandle(indexedDB, databaseName), null);
});
