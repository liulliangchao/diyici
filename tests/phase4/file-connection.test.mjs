import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import {
  connectNewDataFile,
  connectExistingDataFile,
  inspectRememberedDataFile,
  reconnectRememberedDataFile,
} from '../../src/storage/fileConnection.ts';
import { parseAppData } from '../../src/storage/dataCodec.ts';

const databaseNames = new Set();

function makeMemoryHandle(name = 'work-life-data.json', initial = '') {
  return {
    name,
    value: initial,
    permission: 'granted',
    async getFile() { return { text: async () => this.value }; },
    async createWritable() {
      const handle = this;
      return {
        async write(text) { handle.value = text; },
        async close() {},
        async abort() {},
      };
    },
    async queryPermission() { return this.permission; },
    async requestPermission() { return this.permission; },
  };
}

function setup() {
  const databaseName = `phase4-${crypto.randomUUID()}`;
  databaseNames.add(databaseName);
  const handleStore = {
    value: null,
    async remember(handle) { this.value = handle; },
    async recall() { return this.value; },
  };
  return { factory: indexedDB, databaseName, handleStore };
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

test('creating a primary file initializes it before remembering the handle', async () => {
  const options = setup();
  const handle = makeMemoryHandle();
  const result = await connectNewDataFile({
    showSaveFilePicker: async (pickerOptions) => {
      assert.equal(pickerOptions.suggestedName, '个人工作生活数据.json');
      return handle;
    },
  }, options);

  assert.equal(result.handle.name, handle.name);
  assert.equal(result.data.schemaVersion, 1);
  assert.deepEqual(parseAppData(handle.value), result.data);
  assert.equal((await inspectRememberedDataFile(options)).status, 'connected');
});

test('opening an existing data file validates it before remembering the handle', async () => {
  const options = setup();
  const handle = makeMemoryHandle('existing.json', JSON.stringify({ schemaVersion: 1, createdAt: 'bad' }));
  await assert.rejects(connectExistingDataFile({
    showOpenFilePicker: async (pickerOptions) => {
      assert.equal(pickerOptions.mode, 'readwrite');
      return [handle];
    },
  }, options), /时间戳/);
  assert.equal((await inspectRememberedDataFile(options)).status, 'missing');
});

test('opening a valid file stores and returns its parsed data', async () => {
  const options = setup();
  const handle = makeMemoryHandle('existing.json');
  const emptyData = (await connectNewDataFile({ showSaveFilePicker: async () => handle }, options)).data;
  const reopened = await connectExistingDataFile({ showOpenFilePicker: async () => [handle] }, options);
  assert.deepEqual(reopened.data, emptyData);
  assert.equal((await inspectRememberedDataFile(options)).status, 'connected');
});

test('remembered files require an explicit reauthorization when permission expires', async () => {
  const options = setup();
  const handle = makeMemoryHandle();
  await connectNewDataFile({ showSaveFilePicker: async () => handle }, options);
  handle.permission = 'prompt';

  const reconnectState = await inspectRememberedDataFile(options);
  assert.equal(reconnectState.status, 'permission-required');
  if (reconnectState.status !== 'permission-required') return;
  handle.requestPermission = async () => { handle.permission = 'granted'; return handle.permission; };
  const connected = await reconnectRememberedDataFile(reconnectState.handle);
  assert.equal(connected.handle.name, handle.name);
  assert.equal(connected.data.schemaVersion, 1);
});

test('unsupported file pickers fail with a user-readable error', async () => {
  await assert.rejects(connectNewDataFile({}), /浏览器不支持直接保存本地文件/);
  await assert.rejects(connectExistingDataFile({}), /浏览器不支持直接打开本地文件/);
});
