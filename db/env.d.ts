declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI_API_KEY?: string;
    AI_PROVIDER?: string;
    AI_MODEL?: string;
  }
}
