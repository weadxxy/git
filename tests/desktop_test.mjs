import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(path.join(os.tmpdir(), 'lumenfall-desktop-'));
const artifacts = path.join(root, 'test-results');
await mkdir(artifacts, { recursive: true });
const executable = process.env.LUMENFALL_EXECUTABLE;
const args = executable ? ['--smoke-test'] : [root, '--smoke-test'];
if (process.env.LUMENFALL_TEST_NO_SANDBOX === '1') args.push('--no-sandbox');
const app = await electron.launch({
  ...(executable ? { executablePath: executable } : {}),
  args,
  env: { ...process.env, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: path.join(profile, 'cache') },
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.gameState?.mode === 'intro');
  assert.match(page.url(), /^lumenfall:\/\/game\//);
  assert.equal(await page.title(), '微光之境 · Lumenfall');
  assert.equal(await page.evaluate(() => window.lumenfall.isDesktop), true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(await page.evaluate(async () => (await fetch('/desktop/main.cjs')).status), 404);
  await app.context().setOffline(true);
  await page.screenshot({ path: path.join(artifacts, 'desktop-app.png') });
  await page.getByRole('button', { name: '开启旅途' }).click();
  await page.waitForTimeout(200);
  const initial = await page.evaluate(() => window.gameState.player.x);
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.up('d');
  assert.ok(await page.evaluate(() => window.gameState.player.x) > initial + 30);
  await page.keyboard.press('Space');
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(() => window.gameState.player.jumps), 1);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.gameState.player.jumps), 2);
  await page.keyboard.press('k');
  await page.waitForTimeout(50);
  assert.ok(await page.evaluate(() => window.gameState.player.dashCD) > 0);
  await page.keyboard.press('j');
  assert.ok(await page.evaluate(() => window.gameState.player.attackCD) > 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.gameState.mode), 'paused');
  await page.getByRole('button', { name: '继续旅途' }).click();
  assert.equal(await page.evaluate(() => window.gameState.mode), 'playing');
  await page.getByRole('button', { name: '开启声音' }).click();
  assert.equal(await page.getByRole('button', { name: '关闭声音' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '关闭声音' }).click();
  await page.getByRole('button', { name: '全屏游戏' }).click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.getByRole('button', { name: '退出全屏模式', exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.deepEqual(errors, []);
  console.log('PASS: native desktop window, bundled local assets, offline play, isolated renderer, movement, double jump, dash, attack, pause, audio, fullscreen');
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
