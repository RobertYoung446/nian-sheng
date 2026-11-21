import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyGeneratedFiles, listGeneratedFiles } from '../scripts/local-artifacts.mjs';

test('共享构建仅复制本次产物，保留目标目录旧资源和额外文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'niansheng-artifact-test-'));
  const stage = join(root, 'stage'), first = join(root, 'first'), second = join(root, 'second');
  for (const dir of [stage, first, second]) await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(stage, 'index.html'), 'new index');
  await writeFile(join(stage, 'assets', 'current.js'), 'current');
  for (const dir of [first, second]) {
    await writeFile(join(dir, 'assets', 'old.js'), 'old');
    await writeFile(join(dir, 'assets', 'personal.txt'), 'keep');
  }
  const files = await listGeneratedFiles(stage);
  assert.deepEqual(files, ['assets/current.js', 'index.html']);
  await copyGeneratedFiles(stage, [first, second], files);
  for (const dir of [first, second]) {
    assert.equal(await readFile(join(dir, 'index.html'), 'utf8'), 'new index');
    assert.equal(await readFile(join(dir, 'assets', 'current.js'), 'utf8'), 'current');
    assert.equal(await readFile(join(dir, 'assets', 'old.js'), 'utf8'), 'old');
    assert.equal(await readFile(join(dir, 'assets', 'personal.txt'), 'utf8'), 'keep');
  }
  await assert.rejects(copyGeneratedFiles(stage, [first], ['../outside']), /路径无效/);
});

test('已提交的 Pages 与离线壳清单及其文件一致', async () => {
  const pages = new URL('../docs/', import.meta.url), local = new URL('../public/local/', import.meta.url);
  const pagesList = JSON.parse(await readFile(new URL('assets.json', pages), 'utf8'));
  const localList = JSON.parse(await readFile(new URL('assets.json', local), 'utf8'));
  assert.deepEqual(pagesList, localList);
  assert.ok(pagesList.includes('index.html'));
  for (const file of pagesList) assert.deepEqual(await readFile(new URL(file, pages)), await readFile(new URL(file, local)), file);
  const html = await readFile(new URL('index.html', pages), 'utf8');
  const referenced = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(referenced.length >= 2);
  for (const file of referenced) assert.ok(pagesList.includes(file), file);
});

test('构建前拒绝覆盖已暂存或未暂存的生成文件修改', async () => {
  const { execFileSync } = await import('node:child_process');
  const { assertSafeToOverwrite } = await import('../scripts/local-artifacts.mjs');
  const root = await mkdtemp(join(tmpdir(), 'niansheng-dirty-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init');
  await mkdir(join(root, 'docs'), { recursive: true });
  const first = join(root, 'docs', 'index.html'), second = join(root, 'docs', 'sw.js');
  await writeFile(first, 'baseline index'); await writeFile(second, 'baseline worker');
  git('add', '--', 'docs/index.html', 'docs/sw.js');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const targets = [{ path: first, data: Buffer.from('new index') }, { path: second, data: Buffer.from('new worker') }];
  await assertSafeToOverwrite(root, targets);
  await writeFile(first, 'unstaged edit');
  await assert.rejects(assertSafeToOverwrite(root, targets), /未提交|保留/);
  assert.equal(await readFile(first, 'utf8'), 'unstaged edit');
  assert.equal(await readFile(second, 'utf8'), 'baseline worker');
  git('add', '--', 'docs/index.html');
  await assert.rejects(assertSafeToOverwrite(root, targets), /未提交|保留/);
  await assertSafeToOverwrite(root, [{ path: first, data: Buffer.from('unstaged edit') }]);
});

test('构建前保护未跟踪文件及无 Git 工作区中的不同内容', async () => {
  const { execFileSync } = await import('node:child_process');
  const { assertSafeToOverwrite } = await import('../scripts/local-artifacts.mjs');
  const root = await mkdtemp(join(tmpdir(), 'niansheng-untracked-test-'));
  const target = join(root, 'personal.txt');
  await writeFile(target, 'personal');
  await assert.rejects(assertSafeToOverwrite(root, [{ path: target, data: Buffer.from('new') }]), /未提交|保留/);
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  await assert.rejects(assertSafeToOverwrite(root, [{ path: target, data: Buffer.from('new') }]), /未提交|保留/);
  assert.equal(await readFile(target, 'utf8'), 'personal');
  await assertSafeToOverwrite(root, [{ path: target, data: Buffer.from('personal') }]);
});


test('构建保护 Git 隐藏变更标记下的本地修改', async () => {
  const { execFileSync } = await import('node:child_process');
  const { assertSafeToOverwrite } = await import('../scripts/local-artifacts.mjs');
  const root = await mkdtemp(join(tmpdir(), 'niansheng-index-flags-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init');
  for (const file of ['assumed.txt', 'skipped.txt']) await writeFile(join(root, file), 'baseline');
  git('add', '--', 'assumed.txt', 'skipped.txt');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  git('update-index', '--assume-unchanged', '--', 'assumed.txt');
  git('update-index', '--skip-worktree', '--', 'skipped.txt');
  for (const file of ['assumed.txt', 'skipped.txt']) {
    const path = join(root, file);
    await writeFile(path, 'private edit');
    await assert.rejects(assertSafeToOverwrite(root, [{ path, data: Buffer.from('build output') }]), /未提交|保留/);
    assert.equal(await readFile(path, 'utf8'), 'private edit');
  }
});
