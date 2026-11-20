declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI_API_KEY?: string;
    AI_PROVIDER?: string;
    AI_MODEL?: string;
    STRIPE_SECRET_KEY?: string;
    ALLOW_NEW_SUBSCRIPTIONS?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_PRICE_PRO_MONTHLY?: string;
    STRIPE_PRICE_PRO_YEARLY?: string;
    WECHAT_APP_ID?: string;
    WECHAT_APP_SECRET?: string;
  }
}
