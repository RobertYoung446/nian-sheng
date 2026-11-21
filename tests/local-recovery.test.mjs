import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB, IDBObjectStore, IDBKeyRange } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { emptyWorkspace } from '../lib/workspace.ts';

test('损坏空间恢复时原始队列与新空间原子保存，竞争或中断不覆盖原数据', async () => {
  const previous = globalThis.indexedDB, previousRange = globalThis.IDBKeyRange, originalPut = IDBObjectStore.prototype.put;
  globalThis.indexedDB = indexedDB; globalThis.IDBKeyRange = IDBKeyRange;
  try {
    const source = await readFile(new URL('../lib/local-store.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const store = await import('data:text/javascript;base64,' + Buffer.from(compiled.replace("from './workspace'", `from '${new URL('../lib/workspace.ts', import.meta.url).href}'`)).toString('base64'));
    const open = indexedDB.open('niansheng-workspace-v2', 1);
    const db = await new Promise((resolve, reject) => { open.onupgradeneeded = () => open.result.createObjectStore('spaces'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    async function write(key, value) { await new Promise((resolve, reject) => { const tx=db.transaction('spaces','readwrite'); tx.objectStore('spaces').put(value,key); tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error); }); }
    async function get(key) { return new Promise((resolve,reject) => {const request=db.transaction('spaces','readonly').objectStore('spaces').get(key); request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
    const damaged = { snapshot: { workspace: {schemaVersion: 2, ideas: []}, revision: 7, updatedAt: 10 }, pending: [{ id: 'unsynced', data: { content: '需要保留' } }] };
    const replacement = { snapshot: {workspace: emptyWorkspace(),revision: 0,updatedAt: 20}, pending: [] };
    await write('guest', damaged);
    const expected = await store.inspectDamagedLocal('guest');
    await write('guest', {...damaged, marker:'new edit'});
    await assert.rejects(store.replaceDamagedLocal('guest', expected, replacement, 'first'), /变化|更改/);
    assert.equal((await get('guest')).marker,'new edit');
    const nextExpected = await store.inspectDamagedLocal('guest');
    let abort = true;
    IDBObjectStore.prototype.put = function (...args) { const request = originalPut.apply(this,args); if(abort && args[1] === 'guest') {abort=false;this.transaction.abort();} return request; };
    await assert.rejects(store.replaceDamagedLocal('guest', nextExpected, replacement, 'aborted'));
    IDBObjectStore.prototype.put = originalPut;
    assert.equal((await get('guest')).marker,'new edit');
    assert.equal(await get('recovery:guest:aborted'), undefined);
    await store.replaceDamagedLocal('guest', nextExpected, replacement, 'saved');
    assert.deepEqual(await get('guest'), replacement);
    assert.deepEqual((await get('recovery:guest:saved')).original, {...damaged, marker:'new edit'});
    await assert.rejects(store.inspectDamagedLocal('guest'), /正常|损坏/);
    await write('account:test-user', damaged);
    const accountExpected = await store.inspectDamagedLocal('account:test-user');
    await assert.rejects(store.replaceDamagedLocal('account:test-user', accountExpected, { ...replacement, pending: null }, 'account'), /恢复数据无效/);
    assert.deepEqual(await get('account:test-user'), damaged);
    await store.replaceDamagedLocal('account:test-user', accountExpected, replacement, 'account');
    assert.deepEqual((await get('recovery:account:test-user:account')).original.pending, damaged.pending);
    assert.equal((await store.recoveryArchives('guest')).length, 1);
    assert.equal((await store.recoveryArchives('account:test-user')).length, 1);
    assert.equal((await store.recoveryArchives('account:other')).length, 0);
    await write('account:test-user', damaged);
    await assert.rejects(store.replaceDamagedLocal('account:test-user', await store.inspectDamagedLocal('account:test-user'), replacement, 'account'));
    assert.deepEqual(await get('account:test-user'), damaged);
    const brokenQueue = { ...replacement, pending: null };
    await write('guest', brokenQueue);
    await assert.rejects(store.readLocal('guest'), /本机数据需要恢复/);
    const queueVersion = await store.inspectDamagedLocal('guest');
    await store.replaceDamagedLocal('guest', queueVersion, replacement, 'broken-queue');
    assert.deepEqual((await get('recovery:guest:broken-queue')).original, brokenQueue);
    db.close();
  } finally { IDBObjectStore.prototype.put = originalPut; globalThis.indexedDB = previous; globalThis.IDBKeyRange = previousRange; }
});
