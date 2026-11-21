import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyReviewDraft, readReviewDraft, writeReviewDraft } from '../lib/review-draft.ts';
import { workspaceLocation, workspaceUrl } from '../lib/workspace-navigation.ts';
import { layoutGraphPoints, localGraphEdges } from '../lib/workspace-graph.ts';
import { syncFailureMessage } from '../lib/api-client.ts';
import { syncStateAfterBroadcast } from '../lib/sync-broadcast.ts';

test('回顾草稿刷新可恢复，游客与不同账户隔离，成功保存只清除当前草稿', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  const guest = { ...emptyReviewDraft(), evidence:'  侧光拍摄\n第二行', next:'再试一次' };
  writeReviewDraft(storage,'guest',guest);
  writeReviewDraft(storage,'account:one',{ ...emptyReviewDraft(),focus:'学习' });
  assert.deepEqual(readReviewDraft(storage,'guest'),guest);
  assert.deepEqual(readReviewDraft(storage,'account:two'),emptyReviewDraft());
  writeReviewDraft(storage,'account:one',emptyReviewDraft());
  assert.deepEqual(readReviewDraft(storage,'account:one'),emptyReviewDraft());
  assert.deepEqual(readReviewDraft(storage,'guest'),guest);
  values.set('niansheng-review-draft:v1:guest','{"evidence":42}');
  assert.throws(() => readReviewDraft(storage,'guest'));
  assert.equal(values.get('niansheng-review-draft:v1:guest'),'{"evidence":42}');
});

test('390px 图谱初始节点可见，无共同标签或方向不伪造关联', () => {
  const ideas = [{id:'a',tags:['摄影'],intent:'学习'},{id:'b',tags:[],intent:'生活'}];
  const points = layoutGraphPoints(ideas,390,844);
  assert.ok(points.every(point => point.x >= 120 && point.x <= 270 && point.y >= 180 && point.y <= 720));
  assert.ok(points[1].y - points[0].y >= 170);
  assert.deepEqual(localGraphEdges(ideas),[]);
  ideas[1].tags.push('摄影');
  assert.equal(localGraphEdges(ideas)[0].reason,'共享标签：摄影');
  ideas[1].tags=[]; ideas[1].intent='学习';
  assert.equal(localGraphEdges(ideas)[0].type,'相同方向');
});

test('导航关闭记录入口会清除 capture，详情与记录互斥，旧导航兼容', () => {
  assert.equal(workspaceLocation('?view=projects').view,'actions');
  assert.equal(workspaceLocation('?view=network').view,'ideas');
  assert.equal(workspaceLocation('?capture=1&idea=a').capture,false);
  const opened = workspaceUrl('https://example.test/?view=review&keep=yes','review',null,true);
  assert.deepEqual(workspaceLocation(opened.search),{view:'review',idea:null,capture:true});
  const closed = workspaceUrl(opened.href,'review',null);
  assert.equal(workspaceLocation(closed.search).capture,false);
  assert.equal(closed.searchParams.get('keep'),'yes');
  const detail = workspaceUrl(opened.href,'ideas','a',true);
  assert.equal(detail.searchParams.has('capture'),false);
});

test('网络与超时失败明确提示本机操作保留，保留服务端具体错误', () => {
  assert.match(syncFailureMessage(new TypeError('Failed to fetch')),/暂时无法连接同步服务.*待同步操作仍保留/);
  assert.match(syncFailureMessage(new DOMException('aborted','AbortError')),/超时.*仍保留/);
  assert.equal(syncFailureMessage(new Error('云端容量已满，请导出备份')),'云端容量已满，请导出备份');
});

test('跨标签广播按本机队列和冲突更新同步状态，只有成功同步广播可标记已同步', () => {
  const empty = { snapshot: {}, pending: [] };
  assert.equal(syncStateAfterBroadcast(empty, 'updated'), null);
  assert.equal(syncStateAfterBroadcast(empty, 'synced'), 'synced');
  const pending = { ...empty, pending: [{ id: 'operation' }] };
  assert.equal(syncStateAfterBroadcast(pending, 'synced'), 'pending');
  assert.equal(syncStateAfterBroadcast(pending, 'updated'), 'pending');
  assert.equal(syncStateAfterBroadcast({ ...pending, conflict: {} }, 'synced'), 'conflict');
});
