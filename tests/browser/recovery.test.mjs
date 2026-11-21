import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.NIANSHENG_TEST_URL, browserPath = process.env.NIANSHENG_BROWSER_PATH;
if (base && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('浏览器测试只允许本机服务');
for (const account of [false, true]) for (const width of [1280, 390]) {
  test(`损坏空间的备份恢复保留原始数据（${account ? '账户' : '游客'}，${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block', acceptDownloads: true });
      let scope = 'guest', headers;
      if (account) {
        const response = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `recovery-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
        assert.equal(response.status(), 201);
        const id = (await response.json()).user.userId;
        scope = `account:${id}`; headers = { 'X-Niansheng-Account': encodeURIComponent(id) };
        const operation = { id: crypto.randomUUID(), type: 'capture', at: Date.now(), data: { id: crypto.randomUUID(), content: '已有云端记录' } };
        assert.equal((await ctx.request.post(`${base}/api/workspace`, { headers, data: { operation } })).status(), 200);
      }
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      if (account) await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      const damaged = { snapshot: { workspace: { schemaVersion: 2, ideas: [], notes: [], events: [], reviews: [] }, revision: 2, updatedAt: 1 }, pending: [{ id: crypto.randomUUID(), type: 'capture', at: Date.now(), data: { id: crypto.randomUUID(), content: '旧待同步操作' } }] };
      await page.evaluate(async ({ scope, damaged }) => {
        const request = indexedDB.open('niansheng-workspace-v2', 1);
        const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => { const tx = db.transaction('spaces', 'readwrite'); tx.objectStore('spaces').put(damaged, scope); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
        db.close();
      }, { scope, damaged });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor();
      await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      assert.equal(await page.getByRole('button', { name: '导出完整 JSON 备份' }).isDisabled(), true);
      assert.equal(await page.getByText('空间尚未读取，无法显示记录数量').isVisible(), true);
      await page.locator('input[type=file]').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 'fixture', content: '恢复的测试想法' }])) });
      await page.getByText(/旧待同步操作不会自动发送/).waitFor();
      await page.getByRole('button', { name: '确认导入独立副本' }).click();
      if (account) {
        await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor({ timeout: 20000 });
        const cloud = (await (await ctx.request.get(`${base}/api/workspace`, { headers })).json()).workspace;
        assert.deepEqual(cloud.ideas.map(idea => idea.content).sort(), ['已有云端记录', '恢复的测试想法'].sort());
      } else {
        await page.getByText('已导入独立副本，原有数据已保留').waitFor();
        await page.reload({ waitUntil: 'networkidle' });
      }
      await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      assert.equal(await page.getByText('下载的原始数据不能直接作为常规备份导入。', { exact: false }).isVisible(), true);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下载恢复前原始数据' }).click()]);
      const archive = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.deepEqual(archive.originals[0].original, damaged);
      await ctx.close();
    } finally { await browser.close(); }
  });
}
for (const width of [1280, 390]) {
  test(`本机空间修复后重试可重新读取（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      async function put(value) { await page.evaluate(async value => {
        const request = indexedDB.open('niansheng-workspace-v2', 1);
        const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => { const tx = db.transaction('spaces', 'readwrite'); tx.objectStore('spaces').put(value, 'guest'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
      }, value); }
      const valid = { snapshot: { workspace: { schemaVersion: 2, ideas: [], actions: [], notes: [], events: [], reviews: [] }, revision: 0, updatedAt: 0 }, pending: [] };
      await put({ ...valid, pending: null });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor();
      await put(valid);
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('button', { name: '记录想法', exact: true }).isEnabled(), true);
      await ctx.close();
    } finally { await browser.close(); }
  });
}
for (const width of [1280, 390]) {
  test(`账户读取失败后重试保留待同步操作（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      const response = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `retry-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      assert.equal(response.status(), 201);
      const id = (await response.json()).user.userId, scope = `account:${id}`;
      const headers = { 'X-Niansheng-Account': encodeURIComponent(id) };
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      async function put(value) { await page.evaluate(async ({ scope, value }) => {
        const request = indexedDB.open('niansheng-workspace-v2', 1);
        const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        await new Promise((resolve, reject) => { const tx = db.transaction('spaces', 'readwrite'); tx.objectStore('spaces').put(value, scope); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
      }, { scope, value }); }
      const operation = { id: crypto.randomUUID(), type: 'capture', at: Date.now(), data: { id: crypto.randomUUID(), content: '重试后保留的待同步记录' } };
      const valid = { snapshot: { workspace: { schemaVersion: 2, ideas: [], actions: [], notes: [], events: [], reviews: [] }, revision: 0, updatedAt: 0 }, pending: [operation] };
      await put({ ...valid, pending: null });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor();
      let offline = true;
      await ctx.route('**/api/workspace', async route => { if (offline) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '本地测试服务暂不可用' }) }); else await route.continue(); });
      await put(valid);
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor({ state: 'hidden' });
      await page.getByText('本地测试服务暂不可用').waitFor();
      const pending = await page.evaluate(async scope => {
        const request = indexedDB.open('niansheng-workspace-v2', 1);
        const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); });
        const result = await new Promise(resolve => { const r = db.transaction('spaces', 'readonly').objectStore('spaces').get(scope); r.onsuccess = () => resolve(r.result); }); db.close(); return result.pending;
      }, scope);
      assert.deepEqual(pending, [operation]);
      offline = false;
      await page.getByRole('button', { name: '重试', exact: true }).click();
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor({ timeout: 20000 });
      const cloud = (await (await ctx.request.get(`${base}/api/workspace`, { headers })).json()).workspace;
      assert.deepEqual(cloud.ideas.map(idea => idea.content), ['重试后保留的待同步记录']);
      await ctx.close();
    } finally { await browser.close(); }
  });
}
for (const width of [1280, 390]) {
  test(`两个标签同时恢复不会覆盖原始空间（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      await ctx.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }); Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true }); });
      const first = await ctx.newPage(); await first.goto(base, { waitUntil: 'networkidle' });
      const damaged = { snapshot: { workspace: { schemaVersion: 2, ideas: [], notes: [], events: [], reviews: [] }, revision: 0, updatedAt: 1 }, pending: [{ id: 'pending-fixture', type: 'review', data: { text: '旧数据' } }] };
      await first.evaluate(async value => { const request=indexedDB.open('niansheng-workspace-v2',1);const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result)});await new Promise(resolve=>{const tx=db.transaction('spaces','readwrite');tx.objectStore('spaces').put(value,'guest');tx.oncomplete=resolve});db.close(); }, damaged);
      await first.reload({ waitUntil: 'networkidle' });
      const second = await ctx.newPage(); await second.goto(base, { waitUntil: 'networkidle' });
      for (const page of [first, second]) {
        await page.getByText('空间读取失败，请保留浏览器数据并重试').waitFor();
        await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
        await page.locator('input[type=file]').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 'fixture', content: '双标签恢复测试' }])) });
        await page.getByText(/旧待同步操作不会自动发送/).waitFor();
      }
      await Promise.all([first, second].map(page => page.getByRole('button', { name: '确认导入独立副本' }).click()));
      await Promise.all([first, second].map(page => page.getByText(/已导入独立副本，原有数据已保留|本机空间已经恢复正常，请刷新后重试/).waitFor()));
      assert.equal(await first.getByText('已导入独立副本，原有数据已保留').count() + await second.getByText('已导入独立副本，原有数据已保留').count(), 1);
      const values = await first.evaluate(async () => { const request=indexedDB.open('niansheng-workspace-v2',1);const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result)});const values=await new Promise(resolve=>{const r=db.transaction('spaces','readonly').objectStore('spaces').getAll();r.onsuccess=()=>resolve(r.result)});db.close();return values; });
      const archive = values.filter(value => value?.scope === 'guest' && value?.original);
      assert.equal(archive.length, 1); assert.deepEqual(archive[0].original, damaged);
      const space = values.find(value => value?.snapshot?.workspace?.ideas?.some(idea => idea.content === '双标签恢复测试'));
      assert.equal(space.snapshot.workspace.ideas.length, 1);
      await ctx.close();
    } finally { await browser.close(); }
  });
}
