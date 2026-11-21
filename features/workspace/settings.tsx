'use client';
import { useEffect, useState } from 'react';
import type { AiConfig } from '../../app/fluid-graph';
import { clearLocal, downloadBackup, downloadRecoveryArchives, readLocalVersioned, recoveryArchives } from '../../lib/local-store';
import type { Workspace } from '../../lib/workspace';
import type { WorkspaceUser } from './use-workspace';
import { Modal } from './components';
import { apiMessage, objectValue, readApi } from '../../lib/api-client';
import { withWorkspaceLock } from '../../lib/workspace-lock';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export default function Settings({ authHref, close, user, ready, workspace, pending, config, serverAi, saveConfig, reminder, setReminder, importFile, legacy, importLegacy, notify }: { authHref: string; close: () => void; user: WorkspaceUser; ready: boolean; workspace: Workspace; pending: number; config: AiConfig; serverAi: boolean; saveConfig: (config: AiConfig) => void; reminder: boolean; setReminder: (value: boolean) => void; importFile: (file: File) => Promise<void>; legacy: Workspace | null; importLegacy: () => void; notify: (message: string) => void }) {
  const [draft, setDraft] = useState(config);
  const [canManage, setCanManage] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const scope = user ? `account:${user.id}` : 'guest';
  useEffect(() => { let active = true; void recoveryArchives(scope).then(items => { if (active) setHasRecovery(items.length > 0); }).catch(() => { if (active) setHasRecovery(false); }); return () => { active = false; }; }, [scope]);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) void fetch('/api/billing/status', { headers: { 'X-Niansheng-Account': encodeURIComponent(user.id) } }).then(async r => r.ok ? readApi(r) : null).then(d => setCanManage(Boolean(objectValue(d?.subscription).canManage))).catch(() => setCanManage(false));
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onInstall); return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, [user]);
  async function signOut() {
    if (pending) { notify('还有待同步操作，请先完成同步或导出本机备份后再退出'); return; }
    setBusy(true);
    let logoutStarted = false;
    try {
      const scope = user ? `account:${user.id}` : null;
      const local = scope ? await withWorkspaceLock(scope, async assertHeld => {
        const value = await readLocalVersioned(scope);
        assertHeld();
        if (value.envelope.pending.length) throw new Error('另一页面还有待同步记录，请先同步或导出后再退出');
        return value;
      }) : null;
      // Network requests must not keep the cross-tab storage lock busy.
      const status = await fetch('/api/auth/status', { signal: AbortSignal.timeout(15000) });
      const auth = await readApi(status);
      const authUser = objectValue(auth.user);
      if (!status.ok || !user || authUser.userId !== user.id || !['email', 'wechat', 'chatgpt'].includes(String(authUser.authProvider))) {
        throw new Error('无法确认登录状态，请稍后再退出');
      }
      logoutStarted = true;
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Niansheng-Account': encodeURIComponent(user.id) }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if (response.status === 401 || response.status === 428) {
          logoutStarted = false;
          throw new Error(apiMessage(await readApi(response), '登录状态已变化，请刷新后重试'));
        }
        throw new Error('退出失败，请重试');
      }
      if (scope && local) await withWorkspaceLock(scope, async assertHeld => {
        await clearLocal(scope, local.version);
        assertHeld();
      });
      localStorage.removeItem('niansheng-last-account');
      location.assign(authUser.authProvider === 'chatgpt' ? '/signout-with-chatgpt?return_to=%2F' : '/');
    } catch (e) {
      notify(logoutStarted ? '退出可能已经生效；未同步记录会保留在本机，请刷新并重新登录后检查同步' : e instanceof Error ? e.message : '退出失败');
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    try { if (!user) throw new Error('请先登录'); const r = await fetch('/api/billing/portal', { method:'POST', headers: { 'X-Niansheng-Account': encodeURIComponent(user.id) } }); const d = await readApi(r); if (!r.ok || typeof d.url !== 'string') throw new Error(apiMessage(d, '暂时无法打开订阅管理')); location.assign(d.url); }
    catch (e) { notify(e instanceof Error ? e.message : '打开失败'); setBusy(false); }
  }
  return <Modal title="设置与数据" close={close} wide><div className="ns-settings-grid"><section className="ns-panel"><h3>我的空间</h3><p>{user ? `${user.name} · 账户同步空间` : '游客本地空间 · 仅保存在此设备'}</p><p>{ready ? `${workspace.ideas.length} 个想法、${workspace.actions.length} 个行动、${workspace.notes.length} 条记录` : '空间尚未读取，无法显示记录数量'}</p><button disabled={!ready} onClick={() => downloadBackup(workspace)}>导出完整 JSON 备份</button>{!ready ? <p>空间尚未读取，暂时不能导出常规备份；请保留浏览器数据。</p> : null}{hasRecovery ? <div><p>恢复前的原始数据与旧待同步操作仍保存在本机，未自动发送。下载的原始数据不能直接作为常规备份导入。</p><button onClick={() => void downloadRecoveryArchives(scope).catch(error => notify(error.message || '原始数据下载失败'))}>下载恢复前原始数据</button></div> : null}<label>导入备份，先预览再确认<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file).catch(error => notify(error.message || '备份读取失败')); e.target.value = ''; }} /></label>{user && legacy ? <div className="ns-gentle">此设备另有 {legacy.ideas.length} 个本地想法，尚未自动上传。<button onClick={importLegacy}>预览本地数据迁移</button></div> : null}{!user ? <div><a className="ns-link-button" href={authHref}>登录，继续跨设备使用</a>{authHref.startsWith('https:') ? <p>本地版与在线版网址不同，请先导出备份，再到在线版确认导入。</p> : null}</div> : <button disabled={busy} onClick={() => void signOut()}>退出账户</button>}<small>建议定期导出。换浏览器或清除站点数据，会影响仅存于本机的记录和草稿。</small></section>
    <section className="ns-panel"><h3>安装与设备</h3><p>优先支持 Windows 与 Android。安装后可从桌面或主屏直接打开。</p>{install ? <button onClick={() => void install.prompt().then(() => setInstall(null))}>安装念生</button> : <><p><strong>Windows：</strong>使用 Edge 或 Chrome，打开浏览器菜单，选择安装此站点为应用。</p><p><strong>Android：</strong>使用 Chrome 菜单中的“安装应用”或“添加到主屏幕”。</p></>}<p className="ns-muted">离线时保存到本机；恢复网络并登录后同步。跨端修改有冲突时会保留双方版本。</p><label className="ns-checkbox"><input type="checkbox" checked={reminder} onChange={e => setReminder(e.target.checked)} />在今天页显示温和的每周行动提醒</label><small>这是应用内提醒，不会发送推送或邮件。</small></section>
    <section className="ns-panel"><h3>思考伙伴</h3><p>{serverAi ? '站点模型可用，也可以使用自己的临时密钥。' : 'AI 是可选能力，记录与行动不依赖模型。'}</p><label>服务商<select value={draft.provider} onChange={e => { const provider = e.target.value as AiConfig['provider']; setDraft(v => ({ ...v, provider, model: provider === 'deepseek' ? 'deepseek-chat' : provider === 'openrouter' ? 'openai/gpt-4.1-mini' : 'gpt-4.1-mini' })); }}><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option></select></label><label>模型名称<input value={draft.model} maxLength={100} onChange={e => setDraft(v => ({ ...v, model:e.target.value }))} /></label><label>临时 API Key<input type="password" autoComplete="off" value={draft.apiKey} onChange={e => setDraft(v => ({ ...v, apiKey:e.target.value }))} /></label><p className="ns-muted">密钥仅在当前页面内存中，刷新即清除，不进入备份。调用时，经本站转发到所选服务商；只有你主动发起请求才发送相关内容。</p><button disabled={!user} onClick={() => { saveConfig(draft); notify('模型偏好已保存，密钥仅在当前页面有效'); }}>保存连接</button><button onClick={() => { const next = { ...draft, apiKey: '' }; setDraft(next); saveConfig(next); notify('临时密钥已清除'); }}>清除临时密钥</button>{!user ? <small>请登录后使用本站 AI 代理。</small> : null}</section>
    <section className="ns-panel"><h3>免费试用</h3><p>当前免费使用核心记录、行动、回顾、备份与基础同步。购买入口暂未开放。</p><p className="ns-muted">不展示模拟会员或尚未交付的付费权益。云端单空间当前容量为 1.5 MB；达到限制时保留本机操作并明确提示。</p>{canManage ? <button disabled={busy} onClick={() => void manage()}>管理已有订阅</button> : <small>如果以后开通付费，会明确说明价格与权益。</small>}</section></div></Modal>;
}


