import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.NIANSHENG_TEST_URL;
const accountIds = new Map();
const identity = cookie => ({ 'X-Niansheng-Account': encodeURIComponent(accountIds.get(cookie)) });
if(base && !['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname)) throw new Error('集成测试只允许指向本机验收服务');
async function account() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${base}/api/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:`qa-${crypto.randomUUID()}@local.test`,password:'Local-Test-Only-234!',displayName:'本地验收用户'}) });
    if (response.status === 201) {
      const cookie = response.headers.get('set-cookie').split(';')[0];
      const body = await response.json();
      accountIds.set(cookie, body.user.userId);
      return cookie;
    }
    const message = await response.text();
    if (response.status !== 503 || !message.includes('worker restarted mid-request') || attempt === 2) {
      assert.fail(`本地测试账户注册失败（${response.status}）：${message}`);
    }
  }
}
async function request(cookie,operation) {return fetch(`${base}/api/workspace`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...identity(cookie)},body:JSON.stringify({operation})});}
const operation=(type,data,baseVersion)=>({id:crypto.randomUUID(),at:Date.now(),type,data,baseVersion});
test('API：身份隔离、持久化、重试幂等、并发冲突与旧客户端保护',{skip:!base},async()=>{
  assert.equal((await fetch(`${base}/api/workspace`)).status,401);
  const first=await account(),second=await account();
  const capture=operation('capture',{id:crypto.randomUUID(),content:'本地接口验收：创作一份摄影练习'});
  const created=await request(first,capture);assert.equal(created.status,200,await created.clone().text());
  const saved=await created.json();assert.equal(saved.workspace.ideas.length,1);
  const retried=await (await request(first,capture)).json();assert.equal(retried.revision,saved.revision);assert.equal(retried.workspace.ideas.length,1);
  const other=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:second,...identity(second)}})).json();assert.equal(other.workspace.ideas.length,0);
  const id=saved.workspace.ideas[0].id;
  const results=await Promise.all(['端一','端二'].map(title=>request(first,operation('edit',{ideaId:id,title,content:'并发修改测试',tags:[]},1))));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const denied=await request(second,operation('edit',{ideaId:id,title:'越权',content:'测试'},1));assert.equal(denied.status,400);
  const bad=await fetch(`${base}/api/workspace`,{method:'POST',headers:{Cookie:first,'Content-Type':'application/json',...identity(first)},body:'{bad json'});assert.equal(bad.status,400);
  const old=await fetch(`${base}/api/ideas`,{method:'PATCH',headers:{Cookie:first,'Content-Type':'application/json'},body:JSON.stringify({id,status:'已完成'})});assert.equal(old.status,409);
  const persisted=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:first,...identity(first)}})).json();assert.equal(persisted.workspace.ideas[0].version,2);assert.equal(persisted.workspace.ideas[0].status,'待整理');
});
test('API：行动与结果可在另一请求中恢复',{skip:!base},async()=>{
  const cookie=await account(),id=crypto.randomUUID(),actionId=crypto.randomUUID();
  assert.equal((await request(cookie,operation('capture',{id,content:'学习一种摄影构图'}))).status,200);
  assert.equal((await request(cookie,operation('action.create',{ideaId:id,id:actionId,description:'拍三张照片',doneDefinition:'保留三张不同构图的照片'},1))).status,200);
  assert.equal((await request(cookie,operation('action.update',{ideaId:id,id:actionId,status:'doing'},1))).status,200);
  const completion=await request(cookie,operation('action.update',{ideaId:id,id:actionId,status:'done',outcome:'保留三张照片，发现主体需要更突出',learning:'先减法再构图'},2));assert.equal(completion.status,200,await completion.clone().text());
  const persisted=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:cookie,...identity(cookie)}})).json();assert.equal(persisted.workspace.actions[0].status,'done');assert.equal(persisted.workspace.actions[0].learning,'先减法再构图');assert.equal(persisted.workspace.ideas[0].status,'待验证');
});
test('API：同一操作并发重试与响应丢失后重试不会重复写入',{skip:!base},async()=>{
  const cookie = await account();
  const capture = operation('capture',{id:crypto.randomUUID(),content:'一次捕捉'});
  const replies = await Promise.all([request(cookie,capture),request(cookie,capture)]);
  assert.ok(replies.some(response=>response.status===200));
  for (const response of replies) {
    assert.ok([200,503].includes(response.status));
    const completed = response.status===200 ? response : await request(cookie,capture);
    assert.equal(completed.status,200);
    const snapshot = await completed.json();
    assert.equal(snapshot.workspace.ideas.length,1);
    assert.equal(snapshot.revision,1);
  }
  const next = operation('capture',{id:crypto.randomUUID(),content:'后续捕捉'});
  assert.equal((await request(cookie,next)).status,200);
  const retried = await request(cookie,capture);
  assert.equal(retried.status,200);
  const restored = await retried.json();
  assert.equal(restored.revision,2);
  assert.equal(restored.workspace.ideas.length,2);
  assert.equal(restored.workspace.events.filter(event=>event.id===capture.id).length,1);
});
test('AI 接口：未登录和缺少模型密钥时明确失败，不生成模型回复',{skip:!base},async(t)=>{
  const payload = { action:'chat', idea:{ title:'测试想法', content:'一条虚构测试记录' }, question:'如何开始？' };
  const send = cookie => fetch(`${base}/api/ai`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', ...(cookie ? { Cookie:cookie, ...identity(cookie) } : {}) },
    body:JSON.stringify(payload),
  });
  const anonymous = await send();
  assert.equal(anonymous.status,401);
  await anonymous.arrayBuffer();
  const cookie = await account();
  const settings = await fetch(`${base}/api/ai`,{headers:{Cookie:cookie}});
  if ((await settings.json()).serverConfigured) {
    t.skip('本地 Worker 配置了服务端模型，无法验证无密钥路径');
    return;
  }
  const missingKey = await send(cookie);
  assert.equal(missingKey.status,503);
  const result = await missingKey.json();
  assert.equal(result.error,'NO_KEY');
  assert.equal(result.reply,undefined);
  assert.equal(result.mode,undefined);
});

test('切换会话后旧标签的同步不得写入新账户', { skip: !base }, async () => {
  const first = await account(), second = await account();
  const firstUser = (await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: first } })).json()).user;
  const secondUser = (await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: second } })).json()).user;
  const idea = operation('capture', { id: crypto.randomUUID(), content: '隔离测试：原账户待同步记录' });
  const headers = { Cookie: second, 'Content-Type': 'application/json', 'X-Niansheng-Account': encodeURIComponent(firstUser.userId) };
  const denied = await fetch(`${base}/api/workspace`, { method: 'POST', headers, body: JSON.stringify({ operation: idea }) });
  assert.equal(denied.status, 401);
  await denied.arrayBuffer();
  const legacy = await fetch(`${base}/api/workspace`, { headers: { Cookie: second } });
  assert.equal(legacy.status, 428);
  await legacy.arrayBuffer();
  const deniedRead = await fetch(`${base}/api/workspace`, { headers });
  assert.equal(deniedRead.status, 401);
  await deniedRead.arrayBuffer();
  const target = await fetch(`${base}/api/workspace`, { headers: { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(secondUser.userId) } });
  assert.ok(!(await target.json()).workspace.ideas.some(value => value.content === '隔离测试：原账户待同步记录'));
});

test('会话切换后旧页面不能退出新账户', { skip: !base }, async () => {
  const first = await account(), second = await account();
  const firstUser = (await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: first } })).json()).user;
  const secondUser = (await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: second } })).json()).user;
  const legacy = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: second } });
  assert.equal(legacy.status, 428);
  assert.equal(legacy.headers.get('set-cookie'), null);
  await legacy.arrayBuffer();
  const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(firstUser.userId) } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  await response.arrayBuffer();
  const after = await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: second } })).json();
  assert.equal(after.user.userId, secondUser.userId);
});

test('账户切换后 AI 请求在调用模型前被拒绝', { skip: !base }, async t => {
  const first = await account(), second = await account();
  const settings = await (await fetch(`${base}/api/ai`, { headers: { Cookie: second } })).json();
  if (settings.serverConfigured) { t.skip('本地服务配置了模型密钥，不执行该测试'); return; }
  const firstUser = (await (await fetch(`${base}/api/auth/status`, { headers: { Cookie: first } })).json()).user;
  const response = await fetch(`${base}/api/ai`, { method: 'POST', headers: { Cookie: second, 'Content-Type': 'application/json', 'X-Niansheng-Account': encodeURIComponent(firstUser.userId) }, body: JSON.stringify({ action: 'chat', idea: { title: '虚构记录', content: '隔离测试' }, question: '如何开始？' }) });
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.code, 'ACCOUNT_CHANGED');
  const legacy = await fetch(`${base}/api/ai`, { method: 'POST', headers: { Cookie: second, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat' }) });
  assert.equal(legacy.status, 428);
  await legacy.arrayBuffer();
  assert.equal(result.reply, undefined);
});

test('账户切换后订阅信息与管理入口拒绝旧页面', { skip: !base }, async () => {
  const first = await account(), second = await account();
  const firstId = accountIds.get(first), secondId = accountIds.get(second);
  const headers = { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(firstId) };
  const status = await fetch(`${base}/api/billing/status`, { headers });
  assert.equal(status.status, 401);
  assert.equal((await status.json()).code, 'ACCOUNT_CHANGED');
  const portal = await fetch(`${base}/api/billing/portal`, { method: 'POST', headers });
  assert.equal(portal.status, 401);
  assert.equal((await portal.json()).code, 'ACCOUNT_CHANGED');
  const checkout = await fetch(`${base}/api/billing/checkout`, { method: 'POST', headers });
  assert.equal(checkout.status, 401);
  assert.equal((await checkout.json()).code, 'ACCOUNT_CHANGED');
  const legacy = await fetch(`${base}/api/billing/status`, { headers: { Cookie: second } });
  assert.equal(legacy.status, 428); await legacy.arrayBuffer();
  for (const endpoint of ['portal', 'checkout']) {
    const oldPage = await fetch(`${base}/api/billing/${endpoint}`, { method: 'POST', headers: { Cookie: second } });
    assert.equal(oldPage.status, 428); await oldPage.arrayBuffer();
  }
  const current = await fetch(`${base}/api/billing/status`, { headers: { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(secondId) } });
  assert.equal(current.status, 200); await current.arrayBuffer();
});

test('账户切换后公开资料查询在外部检索前被拒绝', { skip: !base }, async () => {
  const first = await account(), second = await account();
  const firstId = accountIds.get(first), secondId = accountIds.get(second);
  const mismatch = await fetch(`${base}/api/research`, { headers: { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(firstId) } });
  assert.equal(mismatch.status, 401);
  assert.equal((await mismatch.json()).code, 'ACCOUNT_CHANGED');
  const legacy = await fetch(`${base}/api/research`, { headers: { Cookie: second } });
  assert.equal(legacy.status, 428); await legacy.arrayBuffer();
  const current = await fetch(`${base}/api/research`, { headers: { Cookie: second, 'X-Niansheng-Account': encodeURIComponent(secondId) } });
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).items, []);
});

test('API：大备份分段保存，超出容量时保留上次提交',{skip:!base,timeout:60000},async()=>{
  const cookie = await account();
  const content = '念'.repeat(2700) + '🌱';
  const ideas = Array.from({length:900}, (_, index) => ({id:`large-${index}`, title:`备份 ${index}`, content}));
  const workspace = {schemaVersion:2, ideas, actions:[], notes:[], events:[], reviews:[]};
  const importing = operation('import',{workspace});
  const first = await request(cookie,importing);
  assert.equal(first.status,200,first.status === 200 ? undefined : await first.text());
  const saved = await first.json();
  assert.ok(Buffer.byteLength(JSON.stringify(saved.workspace)) > 7_500_000);
  assert.equal(saved.workspace.ideas.length,900);
  assert.equal(saved.workspace.ideas.at(-1).content,content);

  const extra = {...workspace, ideas: ideas.slice(0,100).map((idea,index)=>({...idea,id:`extra-${index}`}))};
  const rejected = await request(cookie,operation('import',{workspace:extra}));
  assert.equal(rejected.status,400);
  assert.equal((await rejected.json()).code,'CAPACITY');
  const loaded = await (await fetch(`${base}/api/workspace`,{headers:{Cookie:cookie,...identity(cookie)}})).json();
  assert.equal(loaded.revision,saved.revision);
  assert.deepEqual(loaded.workspace,saved.workspace);
});
