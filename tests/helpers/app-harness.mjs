import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

export async function startAppHarness() {
  const vite = await createViteServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await vite.listen();
  const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  return {
    baseUrl,
    async newContext(fileName = 'test-data.json', options = {}) {
      const context = await browser.newContext();
      if (options.initScript) await context.addInitScript(options.initScript);
      if (options.defaultFilePickers !== false) {
        await context.addInitScript((selectedFileName) => {
          const getHandle = async () => (await navigator.storage.getDirectory()).getFileHandle(selectedFileName, { create: true });
          Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: getHandle });
          Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [await getHandle()] });
        }, fileName);
      }
      return context;
    },
    async connect(page, create = true) {
      await page.goto(baseUrl);
      if (create) await page.getByRole('button', { name: '创建新数据文件' }).click();
      else await page.getByRole('button', { name: '打开已有文件' }).click();
      await page.getByLabel(/数据文件状态：已保存/).waitFor();
    },
    async readData(page, fileName = 'test-data.json') {
      return page.evaluate(async (selectedFileName) => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(selectedFileName);
        return JSON.parse(await (await handle.getFile()).text());
      }, fileName);
    },
    async close() {
      await browser.close();
      await vite.close();
    },
  };
}
