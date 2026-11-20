import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { ensureBillingTables } from '../../../../db/billing';

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : value?.id || null;
}

function periodEnd(subscription: Stripe.Subscription): number | null {
  const values = subscription.items.data.map((item) => item.current_period_end);
  return values.length ? Math.max(...values) * 1000 : null;
}

async function saveSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.nianshengUserId;
  if (!userId) return;
  const customerId = objectId(subscription.customer);
  const active = ['active', 'trialing'].includes(subscription.status);
  await env.DB.prepare(`INSERT INTO subscriptions
    (user_id,plan,status,stripe_customer_id,stripe_subscription_id,current_period_end,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan=excluded.plan,status=excluded.status,stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id,current_period_end=excluded.current_period_end,
      updated_at=excluded.updated_at`)
    .bind(
      userId,
      active ? 'pro' : 'free',
      subscription.status,
      customerId,
      subscription.id,
      periodEnd(subscription),
      Date.now(),
    ).run();
}

export async function POST(request: Request) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Webhook 尚未配置' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: '缺少 Stripe 签名' }, { status: 400 });
  const payload = await request.text();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return Response.json({ error: 'Stripe 签名无效' }, { status: 400 });
  }
  await ensureBillingTables();
  const existing = await env.DB.prepare('SELECT event_id FROM billing_events WHERE event_id=?')
    .bind(event.id)
    .first<{ event_id: string }>();
  if (existing) return Response.json({ received: true, duplicate: true });

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    await saveSubscription(event.data.object);
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id || session.metadata?.nianshengUserId;
    if (userId) {
      await env.DB.prepare(`INSERT INTO subscriptions
        (user_id,plan,status,stripe_customer_id,stripe_subscription_id,current_period_end,updated_at)
        VALUES (?,?,?,?,?,NULL,?)
        ON CONFLICT(user_id) DO UPDATE SET
          plan='pro',status='active',stripe_customer_id=excluded.stripe_customer_id,
          stripe_subscription_id=excluded.stripe_subscription_id,updated_at=excluded.updated_at`)
        .bind(userId, 'pro', 'active', objectId(session.customer), objectId(session.subscription), Date.now())
        .run();
    }
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const customerId = objectId(event.data.object.customer);
    if (customerId) {
      const paid = event.type === 'invoice.paid';
      await env.DB.prepare('UPDATE subscriptions SET plan=?,status=?,updated_at=? WHERE stripe_customer_id=?')
        .bind(paid ? 'pro' : 'free', paid ? 'active' : 'past_due', Date.now(), customerId)
        .run();
    }
  }
  await env.DB.prepare('INSERT INTO billing_events(event_id,event_type,received_at) VALUES (?,?,?)')
    .bind(event.id, event.type, Date.now())
    .run();
  return Response.json({ received: true });
}
