import { build } from 'vite';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertSafeToOverwrite, copyGeneratedFiles, listGeneratedFiles } from './local-artifacts.mjs';

// A fresh staging directory gives the manifest only this build's files while
// preserving old assets and user files in both published output directories.
const stage = await mkdtemp(join(tmpdir(), 'niansheng-local-build-'));
await build({ configFile: resolve('vite.standalone.config.ts'), build: { outDir: stage, emptyOutDir: false } });
await cp('public/favicon.svg', `${stage}/favicon.svg`);
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
manifest.start_url = './index.html'; manifest.scope = './';
manifest.icons = manifest.icons.map(i => ({ ...i, src: i.src.replace(/^\//, './') }));
delete manifest.shortcuts;
await cp('public/icons', `${stage}/icons`, { recursive: true });
await writeFile(`${stage}/manifest.webmanifest`, JSON.stringify(manifest, null, 2));
const files = await listGeneratedFiles(stage);
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(`${stage}/${file}`));
const source = await readFile('scripts/sw-template.js', 'utf8');
hash.update(source);
const version = hash.digest('hex').slice(0, 12);
const assets = Buffer.from(JSON.stringify(files));
const localWorker = Buffer.from(source.replace('__VERSION__', version).replace('__SHELL_ROOT__', '/local/'));
const pagesWorker = Buffer.from(source.replace('__VERSION__', version).replace('__SHELL_ROOT__', './'));
// Keep a reviewable copy even if a destination contains a user's edit.
await writeFile(`${stage}/assets.json`, assets);
await writeFile(`${stage}/sw-local.js`, localWorker);
await writeFile(`${stage}/sw-pages.js`, pagesWorker);
const targets = [];
for (const file of files) {
  const data = await readFile(`${stage}/${file}`);
  targets.push({ path: resolve('public/local', file), data }, { path: resolve('docs', file), data });
}
targets.push(
  { path: resolve('public/local/assets.json'), data: assets },
  { path: resolve('docs/assets.json'), data: assets },
  { path: resolve('public/sw.js'), data: localWorker },
  { path: resolve('docs/sw.js'), data: pagesWorker },
);
try { await assertSafeToOverwrite(process.cwd(), targets); }
catch (error) { throw new Error(`${error instanceof Error ? error.message : '无法检查目标文件'}；本次产物保存在 ${stage}`); }
await copyGeneratedFiles(stage, [resolve('public/local'), resolve('docs')], files);
await writeFile('public/local/assets.json', assets);
await writeFile('docs/assets.json', assets);
await writeFile('public/sw.js', localWorker);
await writeFile('docs/sw.js', pagesWorker);
console.log(`共享本地界面已生成：${files.length} 个文件；其他文件未清空，同名生成文件已更新。`);
