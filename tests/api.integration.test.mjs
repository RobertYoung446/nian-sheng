import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.NIANSHENG_TEST_URL;
if(base && !['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname)) throw new Error('集成测试只允许指向本机验收服务');
async function account() {
  const response = await fetch(`${base}/api/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:`qa-${crypto.randomUUID()}@local.test`,password:'Local-Test-Only-234!',displayName:'本地验收用户'}) });
  assert.equal(response.status,201,await response.clone().text());
  return response.headers.get('set-cookie').split(';')[0];
}
async function request(cookie,operation) {return fetch(`${base}/api/workspace`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({operation})});}
const operation=(type,data,baseVersion)=>({id:crypto.randomUUID(),at:Date.now(),type,data,baseVersion});
test('API：身份隔离、持久化、重试幂等、并发冲突与旧客户端保护',{skip:!base},async()=>{
  assert.equal((await fetch(`${base}/api/workspace`)).status,401);
  const first=await account(),second=await account();
  const capture=operation('capture',{id:crypto.randomUUID(),content:'本地接口验收：创作一份摄影练习'});
  const created=await request(first,capture);assert.equal(created.status,200,await created.clone().text());
  const saved=await created.json();assert.equal(saved.workspace.ideas.length,1);
  const retried=await (await request(first,capture)).json();assert.equal(retried.revision,saved.revision);assert.equal(retried.workspace.ideas.length,1);
  const other=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:second}})).json();assert.equal(other.workspace.ideas.length,0);
  const id=saved.workspace.ideas[0].id;
  const results=await Promise.all(['端一','端二'].map(title=>request(first,operation('edit',{ideaId:id,title,content:'并发修改测试',tags:[]},1))));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const denied=await request(second,operation('edit',{ideaId:id,title:'越权',content:'测试'},1));assert.equal(denied.status,400);
  const bad=await fetch(`${base}/api/workspace`,{method:'POST',headers:{Cookie:first,'Content-Type':'application/json'},body:'{bad json'});assert.equal(bad.status,400);
  const old=await fetch(`${base}/api/ideas`,{method:'PATCH',headers:{Cookie:first,'Content-Type':'application/json'},body:JSON.stringify({id,status:'已完成'})});assert.equal(old.status,409);
  const persisted=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:first}})).json();assert.equal(persisted.workspace.ideas[0].version,2);assert.equal(persisted.workspace.ideas[0].status,'待整理');
});
test('API：行动与结果可在另一请求中恢复',{skip:!base},async()=>{
  const cookie=await account(),id=crypto.randomUUID(),actionId=crypto.randomUUID();
  assert.equal((await request(cookie,operation('capture',{id,content:'学习一种摄影构图'}))).status,200);
  assert.equal((await request(cookie,operation('action.create',{ideaId:id,id:actionId,description:'拍三张照片',doneDefinition:'保留三张不同构图的照片'},1))).status,200);
  assert.equal((await request(cookie,operation('action.update',{ideaId:id,id:actionId,status:'doing'},1))).status,200);
  const completion=await request(cookie,operation('action.update',{ideaId:id,id:actionId,status:'done',outcome:'保留三张照片，发现主体需要更突出',learning:'先减法再构图'},2));assert.equal(completion.status,200,await completion.clone().text());
  const persisted=await (await fetch(`${base}/api/workspace`,{headers:{Cookie:cookie}})).json();assert.equal(persisted.workspace.actions[0].status,'done');assert.equal(persisted.workspace.actions[0].learning,'先减法再构图');assert.equal(persisted.workspace.ideas[0].status,'待验证');
});
