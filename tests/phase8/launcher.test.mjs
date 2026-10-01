import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const launcher = fileURLToPath(new URL('../../Launch-App.bat', import.meta.url));
let browser;

before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { await browser?.close(); });

async function availableLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

test('Windows launcher serves the built app only over its loopback URL', async () => {
  const port = await availableLoopbackPort();
  const child = spawn('cmd.exe', ['/d', '/s', '/c', 'call Launch-App.bat'], {
    cwd: projectRoot,
    env: { ...process.env, LAUNCH_APP_PORT: String(port), LAUNCH_APP_NO_BROWSER: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    const url = `http://127.0.0.1:${port}/`;
    let response;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Launcher exited early (${child.exitCode}).\n${output}`);
      try { response = await fetch(url); break; } catch { await delay(50); }
    }
    assert.ok(response, `Launcher did not start.\n${output}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<div id="root"><\/div>/);
    const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1];
    const stylesheetPath = html.match(/href="([^"]+\.css)"/)?.[1];
    assert.ok(scriptPath, 'built HTML should reference its local application bundle');
    assert.ok(stylesheetPath, 'built HTML should reference its local stylesheet');
    assert.equal((await fetch(new URL(scriptPath, url))).status, 200);
    assert.equal((await fetch(new URL(stylesheetPath, url))).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing.js`)).status, 404);

    const page = await browser.newPage();
    const externalRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
    });
    await page.goto(url);
    await page.getByRole('heading', { name: '首页总览', level: 1 }).waitFor();
    await page.getByRole('link', { name: '数据与设置' }).click();
    await page.getByRole('heading', { name: '数据与设置', level: 1 }).waitFor();
    assert.deepEqual(externalRequests, []);
    await page.close();
  } finally {
    if (child.pid && child.exitCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2500);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
});
