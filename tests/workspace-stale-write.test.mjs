import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB, IDBObjectStore } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as workspace from '../lib/workspace.ts';

test('事务中止和过期写入不覆盖数据；多个标签竞争后可重试保存', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalPut = IDBObjectStore.prototype.put;
  globalThis.indexedDB = indexedDB;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    const source = await readFile(new URL('../lib/local-store.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const store = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace("from './workspace'", `from '${new URL('../lib/workspace.ts', import.meta.url).href}'`)).toString('base64'));
    const original = await store.readLocalVersioned('stale-test');
    original.envelope.snapshot.updatedAt = 10;
    await store.writeLocal('stale-test', original.envelope, original.version);
    const old = await store.readLocalVersioned('stale-test');
    const fresh = await store.readLocalVersioned('stale-test');
    fresh.envelope.snapshot.updatedAt = 20;
    await store.writeLocal('stale-test', fresh.envelope, fresh.version);
    old.envelope.snapshot.updatedAt = 30;
    await assert.rejects(store.writeLocal('stale-test', old.envelope, old.version), error => error.code === 'LOCAL_STALE');
    await assert.rejects(store.clearLocal('stale-test', old.version), error => error.code === 'LOCAL_STALE');
    assert.equal((await store.readLocal('stale-test')).snapshot.updatedAt, 20);

    let abortNext = true;
    IDBObjectStore.prototype.put = function (...args) {
      const result = originalPut.apply(this, args);
      if (this.name === 'spaces' && abortNext) { abortNext = false; this.transaction.abort(); }
      return result;
    };
    const beforeAbort = await store.readLocalVersioned('stale-test');
    beforeAbort.envelope.snapshot.updatedAt = 40;
    await assert.rejects(store.writeLocal('stale-test', beforeAbort.envelope, beforeAbort.version), /本机保存(?:被中断|失败)/);
    IDBObjectStore.prototype.put = originalPut;
    assert.equal((await store.readLocal('stale-test')).snapshot.updatedAt, 20);

    const lockSource = await readFile(new URL('../lib/workspace-lock.ts', import.meta.url), 'utf8');
    const lockJs = ts.transpileModule(lockSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const lockUrl = 'data:text/javascript;base64,' + Buffer.from(lockJs).toString('base64');
    const count = 10, locks = await Promise.all(Array.from({ length: count }, (_, i) => import(`${lockUrl}#tab-${i}`)));
    let ready = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    await Promise.all(locks.map(({ withWorkspaceLock }, i) => {
      const op = { id: crypto.randomUUID(), at: Date.now(), type: 'capture', data: { id: crypto.randomUUID(), content: `并发测试 ${i}` } };
      let firstRead = true;
      return withWorkspaceLock('concurrent-test', async () => {
        const local = await store.readLocalVersioned('concurrent-test');
        if (firstRead) { firstRead = false; if (++ready === count) release(); await gate; }
        const next = { ...local.envelope, snapshot: { ...local.envelope.snapshot, workspace: workspace.applyOperation(local.envelope.snapshot.workspace, op) } };
        await store.writeLocal('concurrent-test', next, local.version);
      });
    }));
    const saved = (await store.readLocal('concurrent-test')).snapshot.workspace.ideas;
    assert.equal(saved.length, count);
    assert.equal(new Set(saved.map(idea => idea.content)).size, count);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    globalThis.indexedDB = originalIndexedDB;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
