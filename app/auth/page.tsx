import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { chatGPTSignInPath, getChatGPTUser } from '../chatgpt-auth';
import AuthClient from './auth-client';

export const dynamic = 'force-dynamic';

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getChatGPTUser();
  if (user) redirect('/');
  const params = await searchParams;
  return (
    <AuthClient
      chatGPTSignInPath={chatGPTSignInPath('/')}
      wechatConfigured={Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET)}
      externalError={params.error || ''}
    />
  );
}
