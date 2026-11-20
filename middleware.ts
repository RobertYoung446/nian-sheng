import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Sites owns the OAuth exchange. Some dispatchers forward the completed
  // callback to the Worker instead of navigating to return_to. Only recover
  // requests whose identity has already been verified by the dispatcher.
  if (
    request.nextUrl.pathname === '/callback' &&
    request.headers.get('oai-authenticated-user-id') &&
    request.headers.get('oai-authenticated-user-email')
  ) {
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }

  return NextResponse.next();
}

export const config = { matcher: '/callback' };
