const CACHE_NAME = 'niansheng-v2-4a6832be51a2';
const SHELL_ROOT = new URL('./', self.location.href);
// Cache the canonical directory URL. Static hosts redirect index.html to this
// address; redirected cached responses cannot satisfy offline navigations.
const FALLBACK = SHELL_ROOT.href;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const response=await fetch(new URL('assets.json',SHELL_ROOT),{cache:'reload'});if(!response.ok)throw new Error('Offline manifest unavailable');const assets=await response.json();await (await caches.open(CACHE_NAME)).addAll(assets.map(asset=>asset==='index.html'?FALLBACK:new URL(asset,SHELL_ROOT).href));})());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('niansheng-')&&key!==CACHE_NAME)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth')||url.pathname.includes('signin')||url.pathname.includes('signout')||url.pathname==='/callback')return;
  if(event.request.mode==='navigate'){
    // Account-rendered HTML is never cached. Offline navigation uses a public
    // shell which chooses a device-local account cache without authentication.
    event.respondWith(fetch(event.request).catch(()=>{
      if(url.pathname===new URL(FALLBACK).pathname)return caches.match(FALLBACK);
      const target=new URL(FALLBACK);target.search=url.search;target.searchParams.set('offline','1');return Response.redirect(target.href,302);
    }));return;
  }
  if(url.href.startsWith(SHELL_ROOT.href))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
