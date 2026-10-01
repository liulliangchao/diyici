import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const fixture = await readFile(new URL('./persistence-fixture.html', import.meta.url), 'utf8');
let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixture);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

after(async () => {
  await browser?.close();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Edge local origin supports secure file handles and IndexedDB reconnect', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl);

  const capabilities = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    openPicker: typeof window.showOpenFilePicker === 'function',
    savePicker: typeof window.showSaveFilePicker === 'function',
    originPrivateFileSystem: typeof navigator.storage?.getDirectory === 'function',
  }));

  assert.equal(capabilities.secureContext, true, 'loopback origin must be a secure context');
  assert.equal(capabilities.openPicker, true, 'Edge must provide the local file picker API');
  assert.equal(capabilities.savePicker, true, 'Edge must provide the local save picker API');
  assert.equal(capabilities.originPrivateFileSystem, true, 'the browser must provide a local file handle for the persistence probe');

  const expected = { schemaVersion: 1, title: '文件写入验证', createdAt: '2026-09-30' };
  await page.evaluate(async (documentToWrite) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('phase1-probe.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(documentToWrite));
    await writable.close();

    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('phase1-probe', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('handles', 'readwrite');
      transaction.objectStore('handles').put(handle, 'primary');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
    database.close();
  }, expected);

  await page.close();
  const reopenedPage = await context.newPage();
  await reopenedPage.goto(baseUrl);
  const restored = await reopenedPage.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('phase1-probe', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const handle = await new Promise((resolve, reject) => {
      const request = database.transaction('handles').objectStore('handles').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const file = await handle.getFile();
    const text = await file.text();
    database.close();
    return JSON.parse(text);
  });

  assert.deepEqual(restored, expected, 'saved JSON and file handle must survive a page close and reopen');
  await context.close();
});
