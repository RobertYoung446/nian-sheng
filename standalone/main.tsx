import { createRoot } from 'react-dom/client';
import WorkspaceApp from '../app/workspace-client';
import '../app/globals.css';
import '../app/workspace.css';
import type { WorkspaceUser } from '../features/workspace/use-workspace';
import { objectValue, readApi } from '../lib/api-client';

async function start() {
  let user: WorkspaceUser = null;
  // GitHub Pages is always a local-only edition. The hosted offline shell may
  // reopen the last account cache, but never has credentials of its own.
  if (location.pathname.startsWith('/local/')) {
    try {
      const response = await fetch('/api/auth/status', { cache:'no-store', signal:AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('offline');
      const value = await readApi(response), account = objectValue(value.user);
      if (typeof account.userId === 'string') user = { id:account.userId, name:String(account.displayName || '我的空间') };
      else if (!navigator.onLine || new URLSearchParams(location.search).get('offline') === '1') throw new Error('offline');
    } catch {
      try { const remembered = JSON.parse(localStorage.getItem('niansheng-last-account') || 'null'); if (typeof remembered?.id === 'string' && typeof remembered?.name === 'string') user = remembered; } catch { /* local-only space remains available */ }
    }
  }
  createRoot(document.getElementById('root')!).render(<WorkspaceApp user={user} authHref={location.pathname.startsWith('/local/') ? '/auth' : 'https://nian-sheng.bobbyyang887.chatgpt.site/auth'}/>);
}
void start();
