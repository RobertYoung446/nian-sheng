import { getChatGPTUser } from './chatgpt-auth';
import Dashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  const name = user?.fullName?.split(/\s+/)[0] || user?.displayName || user?.email.split('@')[0];
  return (
    <Dashboard
      user={user ? { id: user.userId, name: name || '我的空间' } : null}
    />
  );
}
