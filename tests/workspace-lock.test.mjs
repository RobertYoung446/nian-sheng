import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { withWorkspaceLock } from '../lib/workspace-lock.ts';

test('无 Web Locks 时，同标签任务按顺序排队，失败后释放队列', async () => {
  const previousIndexedDB = globalThis.indexedDB;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.indexedDB = indexedDB;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    let release;
    let entered = false;
    const first = withWorkspaceLock('guest', () => new Promise(resolve => { release = resolve; }));
    while (!release) await new Promise(resolve => setTimeout(resolve, 1));
    const second = withWorkspaceLock('guest', async () => { entered = true; return 'second'; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(entered, false);
    release('first');
    assert.equal(await first, 'first');
    assert.equal(await second, 'second');
    await assert.rejects(withWorkspaceLock('guest', async () => { throw new Error('测试失败'); }), /测试失败/);
    assert.equal(await withWorkspaceLock('guest', async () => '可继续'), '可继续');
  } finally {
    globalThis.indexedDB = previousIndexedDB;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('降级路径不为等待中的任务持续访问锁数据库，并能重试版本冲突', async () => {
  const previousIndexedDB = globalThis.indexedDB;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.indexedDB = { open() { throw new Error('不应打开锁数据库'); } };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    let attempts = 0;
    const value = await withWorkspaceLock('test-retry', async () => {
      attempts++;
      if (attempts < 3) throw Object.assign(new Error('版本变化'), { code: 'LOCAL_STALE' });
      return '已保存';
    });
    assert.equal(value, '已保存');
    assert.equal(attempts, 3);
    assert.equal(await withWorkspaceLock('test-wait', async () => {
      await new Promise(resolve => setTimeout(resolve, 30)); return '完成';
    }), '完成');
  } finally {
    globalThis.indexedDB = previousIndexedDB;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('持续竞争超过重试上限时明确失败并释放同标签队列', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    let attempts = 0;
    await assert.rejects(withWorkspaceLock('test-exhaustion', async () => {
      attempts++; throw Object.assign(new Error('本机空间已更改'), { code: 'LOCAL_STALE' });
    }), /本机空间已更改/);
    assert.equal(attempts, 32);
    assert.equal(await withWorkspaceLock('test-exhaustion', async () => '可继续'), '可继续');
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});


test('原生 Web Locks 与降级标签竞争时也重试过期写入', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let lockName;
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: async (name, task) => { lockName = name; return task(); } } }, configurable: true });
  try {
    let attempts = 0;
    const result = await withWorkspaceLock('mixed', async () => {
      if (++attempts === 1) throw Object.assign(new Error('版本变化'), { code: 'LOCAL_STALE' });
      return '保存成功';
    });
    assert.equal(result, '保存成功');
    assert.equal(attempts, 2);
    assert.equal(lockName, 'niansheng:mixed');
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});
