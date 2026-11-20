const UPSTREAM = 'https://nian-sheng.bobbyyang887.chatgpt.site';

const worker = {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers(request.headers);

    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', 'https');

    const origin = headers.get('origin');
    if (origin === incoming.origin) headers.set('origin', UPSTREAM);

    const referer = headers.get('referer');
    if (referer?.startsWith(incoming.origin)) {
      headers.set('referer', UPSTREAM + referer.slice(incoming.origin.length));
    }

    const upstreamResponse = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    const location = responseHeaders.get('location');
    if (location?.startsWith(UPSTREAM)) {
      responseHeaders.set(
        'location',
        incoming.origin + location.slice(UPSTREAM.length),
      );
    }

    if (responseHeaders.get('access-control-allow-origin') === UPSTREAM) {
      responseHeaders.set('access-control-allow-origin', incoming.origin);
    }

    responseHeaders.set('x-nian-sheng-edge', 'cloudflare');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

export default worker;
