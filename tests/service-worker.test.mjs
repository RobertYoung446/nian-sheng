import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('离线壳缓存最终目录地址；离线深链接保留参数且不拦截认证/API', async () => {
  const source = (await readFile(new URL('../scripts/sw-template.js', import.meta.url),'utf8')).replace('__VERSION__','test').replace('__SHELL_ROOT__','/local/');
  const listeners = {}, cached = new Map();
  const origin = 'https://example.test';
  const self = { location:new URL(`${origin}/sw.js`), addEventListener:(type,handler) => listeners[type]=handler };
  vm.runInNewContext(source,{self,URL,Response,fetch:async request => {
    if(String(request).endsWith('assets.json')) return Response.json(['index.html','assets/app.js']);
    throw new Error('offline');
  },caches:{open:async()=>({addAll:async urls=>urls.forEach(url=>cached.set(url,new Response('<html>local shell</html>')))}),match:async url=>cached.get(url)}});
  let installed;
  listeners.install({waitUntil:promise=>installed=promise}); await installed;
  assert.ok(cached.has(`${origin}/local/`));
  assert.ok(!cached.has(`${origin}/local/index.html`));
  async function navigation(path) {
    let response;
    listeners.fetch({request:{url:origin+path,method:'GET',mode:'navigate'},respondWith:value=>response=value});
    return response && await response;
  }
  const redirected = await navigation('/?view=ideas&idea=one');
  const target = new URL(redirected.headers.get('Location'));
  assert.equal(target.pathname,'/local/'); assert.equal(target.searchParams.get('idea'),'one'); assert.equal(target.searchParams.get('offline'),'1');
  const shell = await navigation(target.pathname+target.search);
  assert.equal(await shell.text(),'<html>local shell</html>');
  assert.equal(await navigation('/api/workspace'),undefined);
  assert.equal(await navigation('/auth'),undefined);
});
