import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  return Response.json({
    user,
    wechatConfigured: Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET),
  });
}
