import type { LocalEnvelope } from './local-store';

export function syncStateAfterBroadcast(envelope: LocalEnvelope, message: unknown) {
  if (envelope.conflict) return 'conflict' as const;
  if (envelope.pending.length) return 'pending' as const;
  if (message === 'synced') return 'synced' as const;
  return null;
}
