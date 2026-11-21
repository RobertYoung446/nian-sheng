import { requireExpectedAccount } from '../../../account-bound';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { getChatGPTUser } from '../../../chatgpt-auth';

const stripe = () => new Stripe(env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const mismatch = requireExpectedAccount(request, user.userId);
  if (mismatch) return mismatch;
  if (env.ALLOW_NEW_SUBSCRIPTIONS !== 'true') {
    return Response.json({ error: '当前免费试用，暂未开放新订阅；已有订阅仍可管理' }, { status: 403 });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Demo 尚未配置 Stripe 测试密钥' }, { status: 503 });
  }
  const input = await request.json() as { interval?: 'month' | 'year' };
  const interval = input.interval === 'year' ? 'year' : 'month';
  const price = interval === 'year'
    ? env.STRIPE_PRICE_PRO_YEARLY
    : env.STRIPE_PRICE_PRO_MONTHLY;
  if (!price) return Response.json({ error: '对应会员价格尚未配置' }, { status: 503 });
  const origin = new URL(request.url).origin;
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: user.userId,
    ...(user.email ? { customer_email: user.email } : {}),
    metadata: { nianshengUserId: user.userId, plan: 'pro', interval },
    subscription_data: {
      metadata: { nianshengUserId: user.userId, plan: 'pro', interval },
    },
  });
  if (!session.url) return Response.json({ error: 'Stripe 未返回结账地址' }, { status: 502 });
  return Response.json({ url: session.url });
}
