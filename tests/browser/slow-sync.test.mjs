import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.NIANSHENG_TEST_URL;
const browserPath = process.env.NIANSHENG_BROWSER_PATH;
if (base && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('浏览器测试只允许本机服务');

for (const width of [1280, 390]) {
  test(`慢网络中跨标签保存并在恢复后同步（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    let resume;
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
        const get = IDBObjectStore.prototype.get;
        window.lockGets = 0;
        IDBObjectStore.prototype.get = function (...args) {
          if (this.name === 'locks') window.lockGets++;
          return get.apply(this, args);
        };
      });
      const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `slow-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      assert.equal(registration.status(), 201);
      const identity = { 'X-Niansheng-Account': encodeURIComponent((await registration.json()).user.userId) };
      const first = await ctx.newPage(), second = await ctx.newPage();
      for (const page of [first, second]) {
        page.setDefaultTimeout(15000);
        await page.goto(base);
        await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      }
      let block = true, heldResolve;
      const held = new Promise(resolve => { heldResolve = resolve; });
      const gate = new Promise(resolve => { resume = resolve; });
      await ctx.route('**/api/workspace', async route => {
        if (block && route.request().method() === 'POST') { heldResolve(); await gate; }
        await route.continue();
      });
      async function capture(page, value) {
        await page.getByRole('button', { name: '记录想法', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '记录一个想法' });
        await dialog.getByRole('textbox').fill(value);
        await dialog.getByRole('button', { name: '记下来' }).click();
        await page.getByRole('dialog', { name: value }).waitFor();
      }
      await capture(first, '慢网络第一条');
      await held;
      await capture(second, '慢网络第二条');
      await first.evaluate(() => { window.lockGets = 0; });
      await second.evaluate(() => { window.lockGets = 0; });
      await first.waitForTimeout(1200);
      const calls = await first.evaluate(() => window.lockGets) + await second.evaluate(() => window.lockGets);
      assert.ok(calls < 100, `等待网络时锁读取过多：${calls}`);
      block = false;
      resume();
      await first.locator('.ns-sync-line').getByText('已同步到云端').waitFor({ timeout: 20000 });
      await second.locator('.ns-sync-line').getByText('已同步到云端').waitFor({ timeout: 20000 });
      const final = await (await ctx.request.get(`${base}/api/workspace`, { headers: identity })).json();
      assert.equal(final.workspace.ideas.filter(idea => idea.content.startsWith('慢网络')).length, 2);
      await ctx.close();
    } finally {
      resume?.();
      await browser.close();
    }
  });
}

test('云端已保存但响应丢失时，重试不重复创建', { skip: !base || !browserPath, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
    const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `lost-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
    assert.equal(registration.status(), 201);
    const identity = { 'X-Niansheng-Account': encodeURIComponent((await registration.json()).user.userId) };
    const page = await ctx.newPage();
    await page.goto(base);
    await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    let loseFirst = true;
    await ctx.route('**/api/workspace', async route => {
      if (loseFirst && route.request().method() === 'POST') {
        loseFirst = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: '记录想法', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '记录一个想法' });
    await dialog.getByRole('textbox').fill('响应丢失后重试');
    await dialog.getByRole('button', { name: '记下来' }).click();
    await page.locator('.ns-sync-line').getByText(/同步暂不可用/).waitFor();
    let snapshot = await (await ctx.request.get(`${base}/api/workspace`, { headers: identity })).json();
    assert.equal(snapshot.workspace.ideas.filter(idea => idea.content === '响应丢失后重试').length, 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '刷新同步' }).click();
    await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    snapshot = await (await ctx.request.get(`${base}/api/workspace`, { headers: identity })).json();
    assert.equal(snapshot.workspace.ideas.filter(idea => idea.content === '响应丢失后重试').length, 1);
    await ctx.close();
  } finally { await browser.close(); }
});

for (const width of [1280, 390]) {
  test(`退出请求等待时另一标签的未同步记录受保护（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    let resume;
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
        const get = IDBObjectStore.prototype.get;
        window.lockGets = 0;
        IDBObjectStore.prototype.get = function (...args) {
          if (this.name === 'locks') window.lockGets++;
          return get.apply(this, args);
        };
      });
      const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `logout-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      assert.equal(registration.status(), 201);
      const first = await ctx.newPage(), second = await ctx.newPage();
      for (const page of [first, second]) {
        page.setDefaultTimeout(15000);
        await page.goto(base);
        await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      }
      let heldResolve;
      const held = new Promise(resolve => { heldResolve = resolve; });
      const gate = new Promise(resolve => { resume = resolve; });
      await first.route('**/api/auth/logout', async route => { heldResolve(); await gate; await route.continue(); });
      await second.route('**/api/workspace', async route => {
        if (route.request().method() === 'POST') await route.abort('failed'); else await route.continue();
      });
      await first.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      await first.getByRole('button', { name: '退出账户' }).click();
      await held;
      await second.getByRole('button', { name: '记录想法', exact: true }).click();
      const capture = second.getByRole('dialog', { name: '记录一个想法' });
      await capture.getByRole('textbox').fill('退出期间的新记录');
      await capture.getByRole('button', { name: '记下来' }).click();
      await second.getByRole('dialog', { name: '退出期间的新记录' }).waitFor();
      await first.evaluate(() => { window.lockGets = 0; });
      await second.evaluate(() => { window.lockGets = 0; });
      await first.waitForTimeout(1200);
      const calls = await first.evaluate(() => window.lockGets) + await second.evaluate(() => window.lockGets);
      assert.ok(calls < 100, `等待退出时锁读取过多：${calls}`);
      resume();
      await first.getByText('退出可能已经生效；未同步记录会保留在本机，请刷新并重新登录后检查同步').waitFor();
      const stored = await second.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('niansheng-workspace-v2', 1);
        request.onsuccess = () => {
          const all = request.result.transaction('spaces').objectStore('spaces').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      }));
      assert.ok(stored.some(value => value.pending.length && value.snapshot.workspace.ideas.some(idea => idea.content === '退出期间的新记录')));
      await ctx.close();
    } finally { resume?.(); await browser.close(); }
  });
}

test('没有待同步操作时正常退出并清理账户本机副本', { skip: !base || !browserPath, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
    const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `logout-clean-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
    assert.equal(registration.status(), 201);
    const account = (await (await ctx.request.get(`${base}/api/auth/status`)).json()).user;
    const page = await ctx.newPage();
    await page.goto(base);
    await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
    await page.getByRole('button', { name: '退出账户' }).click();
    await page.locator('.ns-sync-line').getByText('仅保存在此设备').waitFor({ timeout: 15000 });
    assert.equal((await (await ctx.request.get(`${base}/api/auth/status`)).json()).user, null);
    const stored = await page.evaluate(scope => new Promise((resolve, reject) => {
      const request = indexedDB.open('niansheng-workspace-v2', 1);
      request.onsuccess = () => {
        const get = request.result.transaction('spaces').objectStore('spaces').get(scope);
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => reject(get.error);
      };
      request.onerror = () => reject(request.error);
    }), `account:${account.userId}`);
    assert.equal(stored, null);
    await ctx.close();
  } finally { await browser.close(); }
});

for (const width of [1280, 390]) {
  test(`身份状态不可用时不继续退出或清理本机数据（${width}px）`, { skip: !base || !browserPath, timeout: 45000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `status-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      assert.equal(registration.status(), 201);
      const account = (await (await ctx.request.get(`${base}/api/auth/status`)).json()).user;
      const page = await ctx.newPage();
      await page.goto(base);
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      let logoutRequests = 0;
      await page.route('**/api/auth/status', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
      await page.route('**/api/auth/logout', route => { logoutRequests++; return route.continue(); });
      await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      await page.getByRole('button', { name: '退出账户' }).click();
      await page.getByText('无法确认登录状态，请稍后再退出').waitFor({ timeout: 5000 });
      assert.equal(logoutRequests, 0);
      assert.ok((await (await ctx.request.get(`${base}/api/auth/status`)).json()).user);
      const keys = await page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open('niansheng-workspace-v2', 1);
        open.onsuccess = () => { const request = open.result.transaction('spaces').objectStore('spaces').getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); };
        open.onerror = () => reject(open.error);
      }));
      assert.ok(keys.includes(`account:${account.userId}`));
      await ctx.close();
    } finally { await browser.close(); }
  });
}

test('身份已切换到账户之外时不退出或清理原账户', { skip: !base || !browserPath, timeout: 45000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const registration = await ctx.request.post(`${base}/api/auth/register`, { data: { email: `switched-${crypto.randomUUID()}@local.test`, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
    assert.equal(registration.status(), 201);
    const page = await ctx.newPage();
    await page.goto(base);
    await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    let logoutRequests = 0;
    await page.route('**/api/auth/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { userId: 'different-user', authProvider: 'email' } }) }));
    await page.route('**/api/auth/logout', route => { logoutRequests++; return route.continue(); });
    await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
    await page.getByRole('button', { name: '退出账户' }).click();
    await page.getByText('无法确认登录状态，请稍后再退出').waitFor({ timeout: 5000 });
    assert.equal(logoutRequests, 0);
    assert.ok((await (await ctx.request.get(`${base}/api/auth/status`)).json()).user);
    await ctx.close();
  } finally { await browser.close(); }
});

for (const width of [1280, 390]) {
  test(`切换登录账户时旧标签保留待同步记录（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    let resume;
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const emailA = `old-${crypto.randomUUID()}@local.test`, emailB = `new-${crypto.randomUUID()}@local.test`;
      const password = 'Local-Test-Only-234!';
      const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password, displayName: '本地测试' } });
      const first = await register(emailA); assert.equal(first.status(), 201);
      const firstId = (await first.json()).user.userId;
      const page = await ctx.newPage();
      await page.goto(base);
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      let heldResolve;
      const held = new Promise(resolve => { heldResolve = resolve; });
      const gate = new Promise(resolve => { resume = resolve; });
      await page.route('**/api/workspace', async route => {
        if (route.request().method() === 'POST') { heldResolve(); await gate; }
        await route.continue();
      });
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '记录一个想法' });
      await dialog.getByRole('textbox').fill('原账户待同步记录');
      await dialog.getByRole('button', { name: '记下来' }).click();
      await held;
      const second = await register(emailB); assert.equal(second.status(), 201);
      const secondId = (await second.json()).user.userId;
      resume();
      await page.locator('.ns-sync-line').getByText(/登录过期/).waitFor();
      await page.getByText('登录账户已切换；本机记录仍在，请重新登录原账户后同步').waitFor();
      const local = await page.evaluate(scope => new Promise((resolve, reject) => {
        const open = indexedDB.open('niansheng-workspace-v2', 1);
        open.onsuccess = () => { const get = open.result.transaction('spaces').objectStore('spaces').get(scope); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); };
        open.onerror = () => reject(open.error);
      }), `account:${firstId}`);
      assert.ok(local.pending.length && local.snapshot.workspace.ideas.some(idea => idea.content === '原账户待同步记录'));
      async function loginAs(email) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await ctx.request.post(`${base}/api/auth/login`, { data: { email, password } });
          const body = await response.text();
          if (response.status() === 200) return;
          if (response.status() !== 503 || !body.includes('worker restarted mid-request') || attempt === 2) assert.fail(`本地登录失败（${response.status()}）：${body}`);
        }
      }
      await loginAs(emailA);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '刷新同步' }).click();
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      const a = await ctx.request.get(`${base}/api/workspace`, { headers: { 'X-Niansheng-Account': encodeURIComponent(firstId) } });
      assert.equal((await a.json()).workspace.ideas.filter(idea => idea.content === '原账户待同步记录').length, 1);
      await loginAs(emailB);
      const b = await ctx.request.get(`${base}/api/workspace`, { headers: { 'X-Niansheng-Account': encodeURIComponent(secondId) } });
      assert.ok(!(await b.json()).workspace.ideas.some(idea => idea.content === '原账户待同步记录'));
      await ctx.close();
    } finally { resume?.(); await browser.close(); }
  });
}

for (const width of [1280, 390]) {
  test(`退出请求前切换账户不注销新账户（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    let resume;
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      const first = await register(`old-logout-${crypto.randomUUID()}@local.test`);
      assert.equal(first.status(), 201);
      const firstId = (await first.json()).user.userId;
      const page = await ctx.newPage();
      await page.goto(base);
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      let heldResolve;
      const held = new Promise(resolve => { heldResolve = resolve; });
      const gate = new Promise(resolve => { resume = resolve; });
      await page.route('**/api/auth/logout', async route => { heldResolve(); await gate; await route.continue(); });
      await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      await page.getByRole('button', { name: '退出账户' }).click();
      await held;
      const second = await register(`new-logout-${crypto.randomUUID()}@local.test`);
      assert.equal(second.status(), 201);
      const secondId = (await second.json()).user.userId;
      resume();
      await page.getByText('登录账户已切换，未退出当前账户；请刷新后检查').waitFor({ timeout: 15000 });
      const status = await (await ctx.request.get(`${base}/api/auth/status`)).json();
      assert.equal(status.user.userId, secondId);
      const keys = await page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open('niansheng-workspace-v2', 1);
        open.onsuccess = () => { const request = open.result.transaction('spaces').objectStore('spaces').getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); };
        open.onerror = () => reject(open.error);
      }));
      assert.ok(keys.includes(`account:${firstId}`));
      await ctx.close();
    } finally { resume?.(); await browser.close(); }
  });
}

test('旧退出响应晚于新登录时不应清除新会话', { skip: !base || !browserPath, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  let resume;
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
    const first = await register(`delayed-old-${crypto.randomUUID()}@local.test`); assert.equal(first.status(), 201);
    const oldCookies = await ctx.cookies(base);
    const page = await ctx.newPage(); await page.goto(base);
    await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    let heldResolve; const held = new Promise(resolve => { heldResolve = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    await page.route('**/api/auth/logout', async route => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      heldResolve(); await gate;
      await route.fulfill({ response });
    });
    await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
    await page.getByRole('button', { name: '退出账户' }).click();
    await held;
    const oldContext = await browser.newContext();
    await oldContext.addCookies(oldCookies);
    const revoked = await (await oldContext.request.get(`${base}/api/auth/status`)).json();
    assert.equal(revoked.user, null);
    await oldContext.close();
    const second = await register(`delayed-new-${crypto.randomUUID()}@local.test`); assert.equal(second.status(), 201);
    const secondId = (await second.json()).user.userId;
    resume();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const status = await (await ctx.request.get(`${base}/api/auth/status`)).json();
    assert.equal(status.user?.userId, secondId);
    await ctx.close();
  } finally { resume?.(); await browser.close(); }
});

for (const width of [1280, 390]) {
  test(`切换账户后思考伙伴阻止向模型发送旧账户记录（${width}px）`, { skip: !base || !browserPath, timeout: 60000 }, async t => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      const first = await register(`ai-old-${crypto.randomUUID()}@local.test`); assert.equal(first.status(), 201);
      const firstId = (await first.json()).user.userId;
      const config = await (await ctx.request.get(`${base}/api/ai`)).json();
      if (config.serverConfigured) { t.skip('本地服务配置了模型密钥，不执行该测试'); return; }
      const page = await ctx.newPage();
      await page.route('**/api/ai', async route => {
        if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: '{"serverConfigured":true}' });
        else await route.continue();
      });
      await page.goto(base);
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      const capture = page.getByRole('dialog', { name: '记录一个想法' });
      await capture.getByRole('textbox').fill('原账户的虚构想法');
      await capture.getByRole('button', { name: '记下来' }).click();
      const detail = page.getByRole('dialog', { name: '原账户的虚构想法' });
      await detail.waitFor();
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      const second = await register(`ai-new-${crypto.randomUUID()}@local.test`); assert.equal(second.status(), 201);
      await detail.getByRole('button', { name: '思考伙伴' }).click();
      const rejected = page.waitForResponse(response => response.url().endsWith('/api/ai') && response.request().method() === 'POST');
      await detail.getByRole('button', { name: '请思考伙伴帮忙' }).click();
      const response = await rejected;
      assert.equal(response.status(), 401);
      assert.equal(response.request().headers()['x-niansheng-account'], encodeURIComponent(firstId));
      await page.getByText('登录账户已切换，请重新登录原账户后使用 AI').waitFor();
      assert.equal(await detail.getByText('AI 建议 · 已保存到讨论记录').count(), 0);
      await ctx.close();
    } finally { await browser.close(); }
  });
}

test('切换账户后关系图谱不会向模型发送旧账户内容', { skip: !base || !browserPath, timeout: 60000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
    const first = await register(`graph-old-${crypto.randomUUID()}@local.test`); assert.equal(first.status(), 201);
    const firstId = (await first.json()).user.userId;
    if ((await (await ctx.request.get(`${base}/api/ai`)).json()).serverConfigured) { t.skip('本地服务配置了模型密钥，不执行该测试'); return; }
    const page = await ctx.newPage();
    await page.route('**/api/ai', async route => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: '{"serverConfigured":true}' });
      else await route.continue();
    });
    await page.goto(base); await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    for (const value of ['图谱测试一', '图谱测试二']) {
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      const capture = page.getByRole('dialog', { name: '记录一个想法' });
      await capture.getByRole('textbox').fill(value);
      await capture.getByRole('button', { name: '记下来' }).click();
      await page.getByRole('dialog', { name: value }).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
    }
    const second = await register(`graph-new-${crypto.randomUUID()}@local.test`); assert.equal(second.status(), 201);
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: /想法/ }).click();
    const rejected = page.waitForResponse(response => response.url().endsWith('/api/ai') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '打开关系图谱' }).click();
    const response = await rejected;
    assert.equal(response.status(), 401);
    assert.equal(response.request().headers()['x-niansheng-account'], encodeURIComponent(firstId));
    await page.getByText('AI 调用失败 · 显示本地标签与方向连接').waitFor();
    await ctx.close();
  } finally { await browser.close(); }
});

for (const width of [1280, 390]) {
  test(`切换账户后订阅管理不会打开另一账户的门户（${width}px）`, { skip: !base || !browserPath, timeout: 45000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      const first = await register(`billing-old-${crypto.randomUUID()}@local.test`); assert.equal(first.status(), 201);
      const firstId = (await first.json()).user.userId;
      const page = await ctx.newPage();
      let statusHeader;
      await page.route('**/api/billing/status', async route => {
        statusHeader = route.request().headers()['x-niansheng-account'];
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"subscription":{"canManage":true}}' });
      });
      await page.goto(base); await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      await page.locator('.ns-top-actions').getByRole('button', { name: '设置与数据' }).click();
      await page.getByRole('button', { name: '管理已有订阅' }).waitFor();
      assert.equal(statusHeader, encodeURIComponent(firstId));
      const second = await register(`billing-new-${crypto.randomUUID()}@local.test`); assert.equal(second.status(), 201);
      const rejected = page.waitForResponse(response => response.url().endsWith('/api/billing/portal'));
      await page.getByRole('button', { name: '管理已有订阅' }).click();
      const response = await rejected;
      assert.equal(response.status(), 401);
      assert.equal(response.request().headers()['x-niansheng-account'], encodeURIComponent(firstId));
      await page.getByText('登录账户已切换，请刷新后检查当前账户').waitFor();
      assert.ok(page.url().startsWith(base));
      await ctx.close();
    } finally { await browser.close(); }
  });
}

for (const width of [1280, 390]) {
  test(`账户切换后公开资料查询不会继续检索（${width}px）`, { skip: !base || !browserPath, timeout: 45000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const register = email => ctx.request.post(`${base}/api/auth/register`, { data: { email, password: 'Local-Test-Only-234!', displayName: '本地测试' } });
      const first = await register(`research-old-${crypto.randomUUID()}@local.test`); assert.equal(first.status(), 201);
      const firstId = (await first.json()).user.userId;
      const page = await ctx.newPage();
      // Strip the query before it reaches the local Worker, so a regression can never call Bing.
      await page.route('**/api/research?*', route => route.continue({ url: `${base}/api/research` }));
      await page.goto(base); await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      const capture = page.getByRole('dialog', { name: '记录一个想法' });
      await capture.getByRole('textbox').fill('虚构查询测试');
      await capture.getByRole('button', { name: '记下来' }).click();
      const detail = page.getByRole('dialog', { name: '虚构查询测试' }); await detail.waitFor();
      await page.locator('.ns-sync-line').getByText('已同步到云端').waitFor();
      const second = await register(`research-new-${crypto.randomUUID()}@local.test`); assert.equal(second.status(), 201);
      await detail.getByRole('button', { name: '记录与历程' }).click();
      await detail.getByRole('status').getByText(/已保存在本机/).waitFor();
      await detail.getByText('查找公开参考资料（可选）').click();
      const rejected = page.waitForResponse(response => response.url().includes('/api/research'));
      await detail.getByRole('button', { name: '检索公开资讯' }).click();
      const response = await rejected;
      assert.equal(response.status(), 401);
      assert.equal(response.request().headers()['x-niansheng-account'], encodeURIComponent(firstId));
      await page.getByText('登录账户已切换，请刷新后检查当前账户').waitFor();
      await ctx.close();
    } finally { await browser.close(); }
  });
}

for (const width of [1280, 390]) {
  test(`图谱内的提示可通过键盘关闭且不遮挡退出（${width}px）`, { skip: !base || !browserPath, timeout: 45000 }, async () => {
    const browser = await chromium.launch({ headless: true, executablePath: browserPath });
    try {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      const page = await ctx.newPage(); await page.goto(base);
      for (const value of ['图谱提示一', '图谱提示二']) {
        await page.getByRole('button', { name: '记录想法', exact: true }).click();
        const capture = page.getByRole('dialog', { name: '记录一个想法' });
        await capture.getByRole('textbox').fill(value);
        await capture.getByRole('button', { name: '记下来' }).click();
        await page.getByRole('dialog', { name: value }).waitFor();
        await page.keyboard.press('Escape');
      }
      await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: /想法/ }).click();
      await page.getByRole('button', { name: '打开关系图谱' }).click();
      const graph = page.getByRole('dialog', { name: '想法关系海' });
      await graph.getByRole('status').getByText('已保存在此设备').waitFor();
      const dismiss = graph.getByRole('button', { name: '关闭提示' });
      await dismiss.focus();
      await page.keyboard.press('Enter');
      assert.equal(await graph.getByRole('status').count(), 0);
      await graph.getByRole('button', { name: '关闭全屏图谱' }).click();
      assert.equal(await graph.count(), 0);
      await ctx.close();
    } finally { await browser.close(); }
  });
}

test('混合 Web Locks 支持的十个标签并发保存均保留', { skip: !base || !browserPath, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => {
      const original = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        const request = original.call(this, key);
        if (this.name === 'spaces' && key === 'guest' && window.__holdReads) {
          window.__holdReads = false;
          Object.defineProperty(request, 'onsuccess', { set(handler) {
            request.addEventListener('success', event => { window.__readReady = true; window.__releaseRead = () => handler.call(request, event); }, { once: true });
          } });
        }
        return request;
      };
    });
    const pages = await Promise.all(Array.from({ length: 10 }, () => ctx.newPage()));
    for (const page of pages.slice(1)) await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
    await Promise.all(pages.map(page => page.goto(base)));
    assert.equal(await pages[0].evaluate(() => Boolean(navigator.locks)), true);
    for (const [i, page] of pages.entries()) {
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      await page.getByRole('dialog', { name: '记录一个想法' }).getByRole('textbox').fill(`混合并发记录 ${i}`);
      await page.evaluate(() => { window.__holdReads = true; });
    }
    await Promise.all(pages.map(page => page.getByRole('dialog', { name: '记录一个想法' }).getByRole('button', { name: '记下来' }).click()));
    await Promise.all(pages.map(page => page.waitForFunction(() => window.__readReady === true, { timeout: 15000 })));
    await Promise.all(pages.map(page => page.evaluate(() => window.__releaseRead())));
    await Promise.all(pages.map((page, i) => page.getByRole('dialog', { name: `混合并发记录 ${i}` }).waitFor({ timeout: 20000 })));
    const saved = await pages[0].evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('niansheng-workspace-v2');
      open.onsuccess = () => { const get = open.result.transaction('spaces').objectStore('spaces').get('guest'); get.onsuccess = () => resolve(get.result.snapshot.workspace.ideas.map(idea => idea.content)); get.onerror = () => reject(get.error); };
      open.onerror = () => reject(open.error);
    }));
    assert.equal(saved.length, 10);
    assert.equal(new Set(saved).size, 10);
    await ctx.close();
  } finally { await browser.close(); }
});

test('降级路径下关闭等待中的标签页不阻塞其他标签保存', { skip: !base || !browserPath, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
      const original = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        const request = original.call(this, key);
        if (this.name === 'spaces' && key === 'guest' && window.__holdReads) {
          window.__holdReads = false;
          Object.defineProperty(request, 'onsuccess', { set() {
            request.addEventListener('success', () => { window.__readReady = true; }, { once: true });
          } });
        }
        return request;
      };
    });
    const first = await ctx.newPage(), second = await ctx.newPage();
    await Promise.all([first.goto(base), second.goto(base)]);
    async function capture(page, value) {
      await page.getByRole('button', { name: '记录想法', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '记录一个想法' });
      await dialog.getByRole('textbox').fill(value);
      await dialog.getByRole('button', { name: '记下来' }).click();
    }
    await capture(first, '关闭前已保存');
    await first.getByRole('dialog', { name: '关闭前已保存' }).waitFor();
    await first.keyboard.press('Escape');
    await first.getByRole('button', { name: '记录想法', exact: true }).click();
    const dialog = first.getByRole('dialog', { name: '记录一个想法' });
    await dialog.getByRole('textbox').fill('尚未确认保存');
    await first.evaluate(() => { window.__holdReads = true; });
    await dialog.getByRole('button', { name: '记下来' }).click();
    await first.waitForFunction(() => window.__readReady === true);
    await first.close();
    await capture(second, '另一标签已保存');
    await second.getByRole('dialog', { name: '另一标签已保存' }).waitFor();
    const saved = await second.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open('niansheng-workspace-v2');
      open.onsuccess = () => { const get = open.result.transaction('spaces').objectStore('spaces').get('guest'); get.onsuccess = () => resolve(get.result.snapshot.workspace.ideas.map(idea => idea.content)); get.onerror = () => reject(get.error); };
      open.onerror = () => reject(open.error);
    }));
    assert.ok(saved.includes('关闭前已保存'));
    assert.ok(saved.includes('另一标签已保存'));
    await ctx.close();
  } finally { await browser.close(); }
});
