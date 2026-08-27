import { requireChatGPTUser } from './chatgpt-auth';
import Dashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const name = user.fullName?.split(/\s+/)[0] || user.email.split('@')[0];
  return <Dashboard name={name} />;
}
