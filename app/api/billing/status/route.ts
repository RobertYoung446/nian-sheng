import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { publicSubscription, subscriptionForUser } from '../../../../db/billing';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const subscription = await subscriptionForUser(user.userId);
  return Response.json({
    subscription: publicSubscription(subscription),
    checkoutConfigured: Boolean(
      env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO_MONTHLY && env.STRIPE_PRICE_PRO_YEARLY,
    ),
  });
}
