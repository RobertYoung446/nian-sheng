import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, copyWorkspace, emptyWorkspace, exportBackup, focusIdea, parseBackup, readBackupFile, weekStats, WorkspaceError } from '../lib/workspace.ts';
const at = new Date(2026,9,16,12).getTime();
function op(type,data,baseVersion){return {id:crypto.randomUUID(),type,data,baseVersion,at};}
function captured(id='idea-1'){return applyOperation(emptyWorkspace(),op('capture',{id,content:'学习摄影，拍一组自己的照片'}));}
test('捕捉不依赖 AI；重复操作不产生重复想法',()=>{const operation=op('capture',{id:'idea-1',content:'一个念头'});const w=applyOperation(emptyWorkspace(),operation);assert.equal(w.ideas[0].status,'待整理');assert.equal(w.ideas[0].confidence,0);assert.deepEqual(applyOperation(w,operation),w);});
test('开始、结果与下一步闭环；一步完成不结束想法',()=>{let w=captured();w=applyOperation(w,op('action.create',{ideaId:'idea-1',id:'action-1',description:'拍三张照片',doneDefinition:'保留三张照片'},1));assert.equal(w.ideas[0].status,'计划中');assert.throws(()=>applyOperation(w,op('action.create',{ideaId:'idea-1',id:'action-2',description:'重复行动',doneDefinition:'完成'},2)));w=applyOperation(w,op('action.update',{ideaId:'idea-1',id:'action-1',status:'doing'},1));assert.throws(()=>applyOperation(w,op('action.update',{ideaId:'idea-1',id:'action-1',status:'done'},2)));w=applyOperation(w,op('action.update',{ideaId:'idea-1',id:'action-1',status:'done',outcome:'完成三张，发现逆光需要练习'},2));assert.equal(w.actions[0].status,'done');assert.equal(w.ideas[0].status,'待验证');assert.equal(weekStats(w,at).completed,1);});
test('并发编辑不会覆盖另一端记录',()=>{let w=captured();w=applyOperation(w,op('edit',{ideaId:'idea-1',title:'新标题',content:'新原文'},1));assert.throws(()=>applyOperation(w,op('edit',{ideaId:'idea-1',title:'旧端标题',content:'旧端内容'},1)),e=>e instanceof WorkspaceError&&e.code==='CONFLICT');assert.equal(w.ideas[0].title,'新标题');});
test('修订保留旧原文，备份保留空白与长内容',()=>{const original=captured();const previous=original.ideas[0].content;const edited=applyOperation(original,op('edit',{ideaId:'idea-1',title:'新标题',content:'新原文'},1));assert.equal(edited.events.at(-1).before.content,previous);const long='  '+ '长'.repeat(15000)+'\n';original.ideas[0].content=long;assert.equal(parseBackup(exportBackup(original)).ideas[0].content,long);assert.throws(()=>applyOperation(emptyWorkspace(),op('capture',{id:'too-long',content:long})));});
test('归档取消未完成行动、恢复保留记录',()=>{let w=captured();w=applyOperation(w,op('action.create',{ideaId:'idea-1',id:'a',description:'尝试',doneDefinition:'有结果'},1));w=applyOperation(w,op('status',{ideaId:'idea-1',status:'已归档'},2));assert.equal(w.actions[0].status,'cancelled');w=applyOperation(w,op('status',{ideaId:'idea-1',status:'待验证'},3));assert.equal(w.ideas[0].status,'待验证');assert.equal(w.actions.length,1);});
test('周窗口从本地周一开始，排除未来和过去数据',()=>{let w=captured();w.ideas.push({...w.ideas[0],id:'old',createdAt:at-10*86400000});w.ideas.push({...w.ideas[0],id:'future',createdAt:at+86400000});assert.equal(weekStats(w,at).captured,1);assert.equal(new Date(weekStats(w,at).start).getDay(),1);});
test('完整备份可以往返，副本导入不覆盖原记录',()=>{const original=captured();const backup=exportBackup(original);assert.deepEqual(parseBackup(backup),original);const copies=copyWorkspace(original);const w=applyOperation(original,op('import',{workspace:copies}));assert.equal(w.ideas.length,2);assert.notEqual(w.ideas[0].id,w.ideas[1].id);assert.throws(()=>applyOperation(original,op('import',{workspace:original})));});
test('兼容旧数组备份、拒绝示例/损坏/未知版本',()=>{assert.equal(parseBackup([{id:'legacy',content:'旧想法'}]).ideas[0].version,1);assert.throws(()=>parseBackup([{id:'sample-1',content:'示例'}]));assert.throws(()=>parseBackup({workspace:{schemaVersion:99,ideas:[]}}));assert.throws(()=>parseBackup({invalid:true}));});
test('旧版数组中的修订和重新评估历史在副本导入与再次导出后完整保留', async () => {
  const before = { title: '早期标题', content: '  修改前的原文\n' };
  const after = { title: '第二版标题', content: '修改后的内容' };
  const legacy = [{
    id: 'legacy-idea', title: '最后标题', content: '当前原文', tags: ['创作'],
    history: [
      { at: 1700000000000, reason: '缩小范围', goal: '先做一份草稿', before, after },
      { at: 1700000002000, reason: 'AI 重新评估（基于最新描述）', ai: true },
    ],
  }];
  const restored = await readBackupFile(new Blob([JSON.stringify(legacy)]));
  assert.equal(restored.ideas[0].content, '当前原文');
  assert.deepEqual(restored.events.map(({ id, ...event }) => event), [
    { ideaId: 'legacy-idea', at: 1700000000000, kind: '旧版原文修订', reason: '缩小范围', goal: '先做一份草稿', before, after },
    { ideaId: 'legacy-idea', at: 1700000002000, kind: '旧版 AI 重新评估', reason: 'AI 重新评估（基于最新描述）' },
  ]);
  const copies = copyWorkspace(restored);
  const imported = applyOperation(restored, op('import', { workspace: copies }));
  assert.equal(imported.events.length, 4);
  assert.deepEqual(imported.events.slice(2).map(event => event.ideaId), Array(2).fill(copies.ideas[0].id));
  assert.deepEqual(parseBackup(exportBackup(imported)), imported);
});
test('超过 5 MB 的本机备份仍可预览并完整恢复，损坏文件给出明确提示', async () => {
  const content = '备份内容'.repeat(3000);
  const title = '长标题'.repeat(60);
  const original = parseBackup(Array.from({ length: 150 }, (_, index) => ({ id: `large-${index}`, title, content })));
  const file = new Blob([JSON.stringify(exportBackup(original), null, 2)]);
  assert.ok(file.size > 5_000_000);
  const preview = await readBackupFile(file);
  assert.deepEqual(preview, original);
  const imported = applyOperation(emptyWorkspace(), op('import', { workspace: copyWorkspace(preview) }));
  assert.equal(imported.ideas.length, original.ideas.length);
  assert.ok(imported.ideas.every(idea => idea.content === content && idea.title === title));
  await assert.rejects(readBackupFile(new Blob(['{invalid'])), /无法读取备份 JSON/);
});
test('后补学习不改变完成时间和当前想法阶段',()=>{let w=captured();w=applyOperation(w,op('action.create',{ideaId:'idea-1',id:'a',description:'尝试',doneDefinition:'记录结果'},1));w=applyOperation(w,op('action.update',{ideaId:'idea-1',id:'a',status:'done',outcome:'试过了'},1));const completedAt=w.actions[0].completedAt;w=applyOperation(w,op('status',{ideaId:'idea-1',status:'已完成'},3));w=applyOperation(w,{...op('action.update',{ideaId:'idea-1',id:'a',status:'done',outcome:'试过了',learning:'需要调整方法'},2),at:at+86400000});assert.equal(w.actions[0].completedAt,completedAt);assert.equal(w.ideas[0].status,'已完成');assert.equal(w.actions[0].learning,'需要调整方法');});
test('焦点优先用户置顶和实际行动',()=>{let w=captured();w=applyOperation(w,op('capture',{id:'idea-2',content:'另一个念头'}));w.ideas[0].pinned=true;assert.equal(focusIdea(w).id,'idea-2');w.ideas[0].pinned=false;w=applyOperation(w,op('action.create',{ideaId:'idea-1',id:'a',description:'尝试',doneDefinition:'记录'},1));assert.equal(focusIdea(w).id,'idea-1');});
