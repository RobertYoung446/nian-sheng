import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

test('游客只有周回顾时保留已有空间，并可预览迁移到账户', async () => {
  const values = new Map();
  const local = new Map();
  const previousIndexedDB = globalThis.indexedDB;
  const previousLocalStorage = globalThis.localStorage;
  const workspace = { schemaVersion: 2, ideas: [], actions: [], notes: [], events: [], reviews: [
    { id: 'review-1', week: 1, evidence: '我的回顾', changed: '', focus: '', next: '', createdAt: 2 },
  ] };
  const envelope = { snapshot: { workspace, revision: 0, updatedAt: 2 }, pending: [] };
  values.set('guest', structuredClone(envelope));
  local.set('niansheng-public-v1', JSON.stringify([{ id: 'old-idea', content: '旧版想法' }]));
  globalThis.localStorage = { getItem: key => local.get(key) ?? null };
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  get(key) {
                    const read = {};
                    queueMicrotask(() => { read.result = values.get(key); read.onsuccess(); });
                    return read;
                  },
                  put(value, key) {
                    values.set(key, structuredClone(value));
                    queueMicrotask(() => transaction.oncomplete());
                  },
                };
              },
            };
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    const source = await readFile(new URL('../lib/local-store.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const workspaceUrl = new URL('../lib/workspace.ts', import.meta.url).href;
    const moduleText = compiled.replace("from './workspace'", `from '${workspaceUrl}'`);
    const store = await import('data:text/javascript;base64,' + Buffer.from(moduleText).toString('base64'));
    assert.deepEqual(await store.migrateLegacyGuest(), envelope);
    assert.deepEqual(values.get('guest'), envelope);
    assert.deepEqual(await store.legacyBackup(), workspace);
  } finally {
    globalThis.indexedDB = previousIndexedDB;
    globalThis.localStorage = previousLocalStorage;
  }
});
