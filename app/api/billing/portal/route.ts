import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { subscriptionForUser } from '../../../../db/billing';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  if (!env.STRIPE_SECRET_KEY) return Response.json({ error: 'Stripe 尚未配置' }, { status: 503 });
  const subscription = await subscriptionForUser(user.userId);
  if (!subscription?.stripe_customer_id) {
    return Response.json({ error: '尚未找到可管理的会员订阅' }, { status: 404 });
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: new URL(request.url).origin,
  });
  return Response.json({ url: session.url });
}
