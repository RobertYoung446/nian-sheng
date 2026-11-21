// Without Web Locks, each tab serializes its own tasks. Cross-tab writes
// must use the atomic version check in local-store; only stale writes retry.
// Callbacks must not perform network or other non-idempotent side effects.
const tails = new Map<string, Promise<void>>();

async function retryStale<T>(task: (assertHeld: () => void) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await task(() => {}); }
    catch (error) {
      const stale = error && typeof error === 'object' && 'code' in error && error.code === 'LOCAL_STALE';
      if (!stale || attempt >= 31) throw error;
      await new Promise(resolve => setTimeout(resolve, 1 + Math.random() * Math.min(50, 2 ** Math.min(attempt, 5))));
    }
  }
}

export async function withWorkspaceLock<T>(scope: string, task: (assertHeld: () => void) => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(`niansheng:${scope}`, () => retryStale(task));
  const previous = tails.get(scope) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  tails.set(scope, current);
  await previous;
  try {
    return await retryStale(task);
  } finally {
    release();
    if (tails.get(scope) === current) tails.delete(scope);
  }
}
