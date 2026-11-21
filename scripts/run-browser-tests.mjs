import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const base = process.env.NIANSHENG_TEST_URL;
const browserPath = process.env.NIANSHENG_BROWSER_PATH;
if (!base || !browserPath) {
  console.error('浏览器验收未运行：请设置 NIANSHENG_TEST_URL 和 NIANSHENG_BROWSER_PATH。');
  process.exit(2);
}
let url;
try { url = new URL(base); } catch {
  console.error('浏览器验收未运行：本地服务地址无效。');
  process.exit(2);
}
if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
  console.error('浏览器验收未运行：仅允许不含凭据的本机 HTTP(S) 服务地址。');
  process.exit(2);
}
if (!existsSync(browserPath) || !statSync(browserPath).isFile()) {
  console.error('浏览器验收未运行：浏览器程序路径不存在或不是文件。');
  process.exit(2);
}
try {
  const ready = await fetch(new URL('/api/auth/status', url), { signal: AbortSignal.timeout(5000), redirect: 'error' });
  await ready.arrayBuffer();
  if (!ready.ok) throw new Error('not ready');
} catch {
  console.error('浏览器验收未运行：本地服务不可用，请先启动隔离测试服务。');
  process.exit(2);
}
const result = spawnSync(process.execPath, ['--test', 'tests/browser/*.test.mjs'], { stdio: 'inherit' });
if (result.error) console.error('无法启动浏览器验收测试。');
process.exitCode = result.status ?? 1;
