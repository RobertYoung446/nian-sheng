import { cp, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export async function listGeneratedFiles(root, prefix = '') {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listGeneratedFiles(root, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error('生成目录包含不支持的文件类型');
  }
  return files.sort();
}

export async function copyGeneratedFiles(source, destinations, files) {
  for (const file of files) {
    if (isAbsolute(file) || file.split(/[\\/]/).some(part => part === '..' || part === '')) throw new Error('生成文件路径无效');
    const sourcePath = resolve(source, file);
    if (relative(resolve(source), sourcePath).startsWith('..' + sep)) throw new Error('生成文件超出构建目录');
    for (const destination of destinations) {
      const target = resolve(destination, file);
      if (relative(resolve(destination), target).startsWith('..' + sep)) throw new Error('生成文件超出目标目录');
      await mkdir(dirname(target), { recursive: true });
      await cp(sourcePath, target);
    }
  }
}

const runFile = promisify(execFile);
const canonical = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

// Check every destination before writing any of them. If Git cannot identify a
// clean tracked file, preserve any existing content that differs from the build.
export async function assertSafeToOverwrite(cwd, targets) {
  let tracked = new Set(), dirty = new Set(), protectedPaths = new Set(), repository = null;
  const workspace = resolve(cwd);
  const actualWorkspace = await realpath(workspace);
  const paths = targets.map(target => {
    const rel = relative(workspace, resolve(target.path));
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('目标不在工作区内');
    return resolve(actualWorkspace, rel);
  });
  try {
    const root = await runFile('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
    repository = root.stdout.trim();
    for (const path of paths) {
      const rel = relative(repository, path);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('目标不在仓库内');
    }
    const [listed, changed] = await Promise.all([
      runFile('git', ['--no-optional-locks', 'ls-files', '-v', '--full-name', '-z', '--', ...paths], { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }),
      runFile('git', ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', ...paths], { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }),
    ]);
    const entries = listed.stdout.split('\0').filter(Boolean);
    tracked = new Set(entries.map(entry => canonical(resolve(repository, entry.slice(2)))));
    // Git can hide edits for assume-unchanged and skip-worktree entries.
    // Their contents are not reliably classified as clean by status.
    protectedPaths = new Set(entries.filter(entry => entry[0] !== 'H').map(entry => canonical(resolve(repository, entry.slice(2)))));
    dirty = new Set(changed.stdout.split('\0').filter(Boolean).map(entry => canonical(resolve(repository, entry.slice(3)))));
  } catch {
    // A missing Git executable, non-repository directory, or failed check is
    // treated conservatively; never assume existing files are clean.
    repository = null;
  }
  const conflicts = [];
  for (const [index, target] of targets.entries()) {
    const path = paths[index], key = canonical(path);
    let current = null;
    try { current = await readFile(path); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (current && current.equals(Buffer.from(target.data))) continue;
    if (dirty.has(key) || protectedPaths.has(key) || (current && (!repository || !tracked.has(key)))) conflicts.push(relative(cwd, path));
  }
  if (conflicts.length) throw new Error(`构建未覆盖已有未提交或无法确认的文件：${conflicts.join('、')}；请先保留并检查这些文件`);
}
