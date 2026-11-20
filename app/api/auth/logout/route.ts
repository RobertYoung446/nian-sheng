import { clearedSessionCookieHeader, deleteAccountSession } from '../../../account-auth';

export async function POST(request: Request) {
  await deleteAccountSession();
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearedSessionCookieHeader(request.url) } },
  );
}
