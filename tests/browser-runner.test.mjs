import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = new URL('../scripts/run-browser-tests.mjs', import.meta.url);
function run(env) {
  return spawnSync(process.execPath, [fileURLToPath(runner)], {
    encoding: 'utf8',
    env: { ...process.env, NIANSHENG_TEST_URL: '', NIANSHENG_BROWSER_PATH: '', ...env },
  });
}
test('浏览器验收缺少配置时明确失败，而不是全部跳过', () => {
  const result = run({});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /验收未运行/);
});
test('浏览器验收拒绝远程服务及无效浏览器路径', () => {
  const remote = run({ NIANSHENG_TEST_URL: 'https://example.com', NIANSHENG_BROWSER_PATH: process.execPath });
  assert.equal(remote.status, 2);
  assert.match(remote.stderr, /仅允许/);
  const missing = run({ NIANSHENG_TEST_URL: 'http://127.0.0.1:1', NIANSHENG_BROWSER_PATH: 'Z:/not-a-browser' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /浏览器程序路径/);
});

test('浏览器验收在本地服务未就绪时明确失败', () => {
  const result = run({ NIANSHENG_TEST_URL: 'http://127.0.0.1:1', NIANSHENG_BROWSER_PATH: process.execPath });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /本地服务不可用/);
});
