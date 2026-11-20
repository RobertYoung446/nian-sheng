'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type Mode = 'login' | 'register';

const externalErrors: Record<string, string> = {
  wechat_not_configured: '微信登录尚未配置，请先使用邮箱或 ChatGPT 登录。',
  wechat_invalid_callback: '微信返回的信息不完整，请重新扫码。',
  wechat_state_expired: '微信二维码已过期，请重新发起登录。',
  wechat_exchange_failed: '微信授权校验失败，请稍后重试。',
  wechat_linked_elsewhere: '该微信已绑定其他念生账户。',
};

async function readError(response: Response) {
  try {
    const value: unknown = await response.json();
    if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
      return value.error;
    }
  } catch {
    return '服务暂时不可用，请稍后重试';
  }
  return '服务暂时不可用，请稍后重试';
}

export default function AuthClient({
  chatGPTSignInPath,
  wechatConfigured,
  externalError,
}: {
  chatGPTSignInPath: string;
  wechatConfigured: boolean;
  externalError: string;
}) {
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(externalErrors[externalError] || '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      window.location.assign('/');
    } catch {
      setError('网络连接失败，请检查后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link className="auth-brand" href="/">
          <span>念</span>
          <strong>念生</strong>
        </Link>
        <div>
          <p>IDEA TO EVIDENCE</p>
          <h1>让每一个值得实现的想法，都拥有下一步。</h1>
          <span>登录后，在网页、Windows 桌面和 Android 手机间继续你的想法、行动与学习。</span>
        </div>
        <ul>
          <li>快速捕捉，不等待 AI</li>
          <li>一次只推进一个最小行动</li>
          <li>用真实学习完成闭环</li>
        </ul>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-tabs" role="tablist" aria-label="账户操作">
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            注册
          </button>
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            登录
          </button>
        </div>
        <header>
          <small>{mode === 'register' ? 'CREATE YOUR SPACE' : 'WELCOME BACK'}</small>
          <h2 id="auth-title">{mode === 'register' ? '创建你的念生空间' : '回到你的想法空间'}</h2>
          <p>{mode === 'register' ? '邮箱注册后即可跨设备同步。' : '使用注册邮箱继续推进。'}</p>
        </header>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              你的称呼
              <input
                autoComplete="name"
                maxLength={40}
                minLength={2}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：小念"
                required
                value={displayName}
              />
            </label>
          )}
          <label>
            邮箱
            <input
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            密码
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              maxLength={128}
              minLength={10}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? '至少 10 位，包含字母和数字' : '输入你的密码'}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" disabled={pending} type="submit">
            {pending ? '正在安全连接…' : mode === 'register' ? '创建账户并进入' : '登录念生'}
          </button>
        </form>

        <div className="auth-divider"><span>或使用可信身份</span></div>
        <div className="auth-providers">
          <a className="wechat-auth" aria-disabled={!wechatConfigured} href={wechatConfigured ? '/api/auth/wechat/start?return_to=/' : undefined}>
            <span>微</span>
            <strong>微信扫码辅助注册 / 登录</strong>
            <small>{wechatConfigured ? '使用微信开放平台授权' : '等待配置微信开放平台凭据'}</small>
          </a>
          <a className="chatgpt-auth" href={chatGPTSignInPath} target="_top">
            <span>◎</span>
            <strong>使用 ChatGPT 账户继续</strong>
            <small>兼容原有念生账户与数据</small>
          </a>
        </div>
        <p className="auth-privacy">已有本地记录不会自动上传。登录后可在设置中预览并确认迁移。</p>
        <Link href="/">先使用本地空间</Link>
      </section>
    </main>
  );
}
