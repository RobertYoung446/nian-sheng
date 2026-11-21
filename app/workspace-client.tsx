'use client';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { copyWorkspace, currentAction, emptyWorkspace, focusIdea, newIdea, readBackupFile, weekStats, type Operation, type Workspace } from '../lib/workspace';
import { downloadBackup, legacyBackup } from '../lib/local-store';
import { useWorkspace, type WorkspaceUser } from '../features/workspace/use-workspace';
import { Empty, Icon, IdeaCard, Modal, NoticeContext, NoticeRegion } from '../features/workspace/components';
import IdeaDetail from '../features/workspace/idea-detail';
import Settings from '../features/workspace/settings';
import type { AiConfig } from './fluid-graph';
import { readApi } from '../lib/api-client';
import { emptyReviewDraft, readReviewDraft, writeReviewDraft, type ReviewDraft } from '../lib/review-draft';
import { workspaceLocation, workspaceUrl, type View } from '../lib/workspace-navigation';

const FluidGraph = lazy(() => import('./fluid-graph'));
const navigation: { id: View; label: string }[] = [{ id: 'today', label: '今天' }, { id: 'ideas', label: '想法' }, { id: 'actions', label: '行动' }, { id: 'review', label: '回顾' }];
const titles = { today: '给值得做的事，留一个下一步', ideas: '你的想法，慢慢生长', actions: '一次，认真做一小步', review: '从经历里，看见自己的方向' };
const syncLabels = { loading: '正在读取空间', local: '仅保存在此设备', synced: '已同步到云端', pending: '已保存在本机 · 待同步', offline: '离线 · 本机记录仍在', auth: '登录过期 · 本机记录仍在', conflict: '同步冲突 · 本机副本已保留', error: '同步暂不可用 · 请查看提示' };
const defaults: AiConfig = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: '' };

export default function WorkspaceApp({ user = null, authHref = '/auth' }: { user?: WorkspaceUser; authHref?: string }) {
  const space = useWorkspace(user);
  const [view, setView] = useState<View>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(''); const [draftLoaded, setDraftLoaded] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false); const [demo, setDemo] = useState<Workspace | null>(null);
  const [filter, setFilter] = useState('全部'); const [query, setQuery] = useState(''); const [sort, setSort] = useState('最近更新');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaults); const [serverAi, setServerAi] = useState(false);
  const [imported, setImported] = useState<Workspace | null>(null); const [legacy, setLegacy] = useState<Workspace | null>(null);
  const [reminder, setReminder] = useState(false);
  const [reviewForm, setReviewForm] = useState({ scope: '', value: emptyReviewDraft() });
  const reviewDraft = reviewForm.scope === space.scope ? reviewForm.value : emptyReviewDraft();
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const workspace = demo || space.workspace, selected = workspace.ideas.find(i => i.id === selectedId);
  const focus = focusIdea(workspace), stats = weekStats(workspace);
  const navigate = useCallback((next: View, id: string | null = null, replace = false, capture = false) => {
    setView(next); setSelectedId(id); setCaptureOpen(capture && !id);
    const url = workspaceUrl(location.href, next, id, capture);
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    if (!id) window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const closeDetail = useCallback(() => navigate(view, null, true), [navigate, view]);
  const closeCapture = useCallback(() => navigate(view, null, true), [navigate, view]);
  const openCapture = () => navigate(view, null, false, true);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useEffect(() => {
    const restore = () => { const next = workspaceLocation(location.search); setView(next.view); setSelectedId(next.idea); setCaptureOpen(next.capture); };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    try { setReviewForm({ scope: space.scope, value: readReviewDraft(localStorage, space.scope) }); }
    catch { setReviewForm({ scope: space.scope, value: emptyReviewDraft() }); setNotice('上次回顾草稿无法恢复，已有记录未受影响'); }
  }, [space.scope]);
  function setReviewDraft(value: ReviewDraft) {
    setReviewForm({ scope: space.scope, value });
    try { writeReviewDraft(localStorage, space.scope, value); }
    catch { setNotice('回顾草稿暂未持久保存，请勿关闭页面'); }
  }
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(`niansheng-draft:${space.scope}`) || ''); setReminder(localStorage.getItem('niansheng-weekly-reminder') === 'true');
      for (const key of ['niansheng_ai_config_v1', 'niansheng-ai-config-v1']) {
        const raw = localStorage.getItem(key); if (raw) { const old = JSON.parse(raw); if (old.provider && old.model) localStorage.setItem('niansheng-ai-preferences', JSON.stringify({ provider:old.provider, model:old.model })); localStorage.removeItem(key); }
      }
      const preferences = JSON.parse(localStorage.getItem('niansheng-ai-preferences') || 'null');
      if (preferences && ['openai','deepseek','openrouter'].includes(preferences.provider) && typeof preferences.model === 'string') setAiConfig({ ...preferences, apiKey:'' });
    } catch { setNotice('浏览器偏好设置不可用，请检查存储设置'); }
    setDraftLoaded(true);
    if (user) { void legacyBackup().then(setLegacy).catch(() => setNotice('旧本地记录需要检查，原数据未被覆盖')); void fetch('/api/ai').then(readApi).then(d => setServerAi(Boolean(d.serverConfigured))).catch(() => undefined); }
  }, [space.scope, user]);
  useEffect(() => { if (draftLoaded) { try { localStorage.setItem(`niansheng-draft:${space.scope}`, draft); } catch { setNotice('草稿暂未持久保存，请勿关闭页面'); } } }, [draft, draftLoaded, space.scope]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register(location.pathname.startsWith('/local/') ? '/sw.js' : new URL('./sw.js', location.href).href).then(registration => {
      if (registration.waiting) setUpdateWorker(registration.waiting);
      registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateWorker(worker); }); });
    }).catch(() => undefined);
  }, []);
  const run = async (type: Operation['type'], data: Record<string, unknown>, baseVersion?: number) => {
    if (demo) throw new Error('当前是示例空间，请回到我的空间后操作');
    await space.commit({ id:crypto.randomUUID(), type, at:Date.now(), data, baseVersion });
  };
  async function capture() {
    if (busy || !draft.trim()) return; setBusy(true);
    try { const id = crypto.randomUUID(); await run('capture', { id, content:draft }); setDraft(''); setCaptureOpen(false); navigate('ideas', id); setNotice(user ? '已保存在本机，正在同步；可以继续记录' : '已保存在此设备'); }
    catch (e) { setNotice(e instanceof Error ? e.message : '保存失败，输入已保留'); } finally { setBusy(false); }
  }
  function enterDemo() {
    const w = emptyWorkspace(), at = Date.now();
    w.ideas = [newIdea('做一份属于自己的街区声音地图', 'sample-1', at), newIdea('用十分钟学习一个新的摄影技巧', 'sample-2', at), newIdea('每周给未来的自己写一封信', 'sample-3', at)];
    w.ideas[0].intent = '创作'; w.ideas[1].intent = '学习'; w.ideas[2].intent = '生活'; setDemo(w); navigate('today');
  }
  async function confirmImport() {
    if (!imported || busy) return; setBusy(true);
    try {
      if (demo) throw new Error('当前是示例空间，请回到我的空间后操作');
      const operation: Operation = { id: crypto.randomUUID(), type: 'import', at: Date.now(), data: { workspace: copyWorkspace(imported) } };
      if (!space.ready) await space.recover(operation); else await space.commit(operation);
      setImported(null); setLegacy(null); setNotice('已导入独立副本，原有数据已保留');
    }
    catch (e) { setNotice(e instanceof Error ? e.message : '导入失败'); } finally { setBusy(false); }
  }
  const captureForm = (inputId: string) => <form className="ns-capture-form" onSubmit={e => { e.preventDefault(); void capture(); }}><label htmlFor={inputId}>不用完整，先把念头留下来</label><textarea id={inputId} placeholder="我刚想到……" value={draft} maxLength={12000} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void capture(); } }} /><footer><small>先保存，整理和 AI 都可以稍后再做</small><button className="ns-primary" disabled={busy || !space.ready || !draft.trim() || !!demo}>{busy ? '正在保存…' : '记下来'}</button></footer></form>;
  const shown = workspace.ideas.filter(i => filter === '已归档' ? i.status === '已归档' : i.status !== '已归档' && (filter === '全部' || i.status === filter || i.intent === filter)).filter(i => [i.title,i.content,i.summary,...i.tags,...workspace.notes.filter(n => n.ideaId === i.id).map(n => n.content),...workspace.actions.filter(a => a.ideaId === i.id).flatMap(a => [a.description,a.outcome,a.learning])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b) => sort === '创建时间' ? b.createdAt-a.createdAt : sort === '标题' ? a.title.localeCompare(b.title,'zh-CN') : Number(b.pinned)-Number(a.pinned) || b.updatedAt-a.updatedAt);
  const active = workspace.ideas.filter(i => currentAction(workspace,i.id));
  const pairs = workspace.ideas.filter(i => i.status !== '已归档').flatMap((a,index,all) => all.slice(index+1).filter(b => a.tags.some(t => b.tags.includes(t)) || a.intent === b.intent && a.intent !== '探索').map(b => ({ a,b,reason:a.tags.filter(t => b.tags.includes(t)).join('、') || `${a.intent}方向可能复用经验` }))).slice(0,20);
  const open = (id: string) => navigate(view,id);
  return <NoticeContext.Provider value={{ notice, dismiss: () => setNotice('') }}><div className="ns-app"><div id="ns-content"><aside className="ns-sidebar"><a className="ns-brand" href="?view=today" onClick={e => { e.preventDefault(); navigate('today'); }}><span className="ns-brand-mark">念</span><span>念生<small>让想法，真正发生</small></span></a><nav aria-label="主导航">{navigation.map(n => <button key={n.id} className={view === n.id ? 'active' : ''} aria-current={view === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}><Icon name={n.id}/><span>{n.label}</span>{n.id === 'ideas' && workspace.ideas.some(i => i.status === '待整理') ? <b>{workspace.ideas.filter(i => i.status === '待整理').length}</b> : null}</button>)}</nav><div className="ns-sidebar-bottom"><p>{demo ? '独立示例空间' : user?.name || '我的本地空间'}</p><small>{demo ? '体验不会改变你的记录' : syncLabels[space.state]}</small><button onClick={() => setSettingsOpen(true)}><Icon name="settings"/>设置与数据</button></div></aside><main className="ns-main"><header className="ns-topbar"><div><p>{new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</p><h1>{titles[view]}</h1></div><div className="ns-top-actions"><button className="ns-icon-button" aria-label="设置与数据" onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button><button className="ns-primary" aria-label="记录想法" onClick={openCapture} disabled={!!demo || !space.ready}><Icon name="plus"/><span>记录想法</span></button></div></header>
    <div className="ns-sync-line" role="status"><span>{demo ? '演示数据 · 不参与个人统计或同步' : syncLabels[space.state]}{!demo && space.pending ? `（${space.pending} 项）` : ''}</span>{user && !demo ? <button onClick={() => void space.sync()}>刷新同步</button> : null}{demo ? <button onClick={() => { setDemo(null); navigate('today'); }}>回到我的空间</button> : null}</div>
    {space.error && !demo ? <div className="ns-warning" role="alert">{space.error}{space.state === 'auth' ? <a href={authHref}>重新登录</a> : <button onClick={() => void space.retry()}>重试</button>}</div> : null}
    {space.state === 'conflict' && !demo ? <div className="ns-warning"><strong>另一端有新的修改</strong><p>云端版本与本机修改都会保留。本机涉及的想法将另存为标有“冲突副本”的记录。</p><button onClick={() => void space.resolveConflict().catch(e => setNotice(e.message))}>保留双方版本并继续同步</button><button onClick={() => downloadBackup(space.workspace,'念生冲突备份')}>先导出本机副本</button></div> : null}
    {updateWorker ? <div className="ns-warning">新版本已准备好，草稿和待同步操作会保留。<button onClick={() => { navigator.serviceWorker.addEventListener('controllerchange',() => location.reload(),{once:true}); updateWorker.postMessage({type:'SKIP_WAITING'}); }}>更新应用</button></div> : null}
    {!space.ready && !demo ? <div className="ns-empty">{space.state === 'error' ? '空间读取失败，请保留浏览器数据并重试' : '正在打开你的空间…'}</div> : null}
    {(space.ready || demo) && view === 'today' && <>{workspace.ideas.length === 0 ? <section className="ns-welcome"><span className="ns-eyebrow">给一个念头，留一点空间</span><h2>创作、学习、生活，<br/>从你自己的想法开始。</h2><p>一句模糊的直觉也可以。先留下，再决定是否值得继续。</p>{captureForm('ns-draft-inline')}<button className="ns-text-button" onClick={enterDemo}>先体验三个示例 →</button>{!user ? <p className="ns-muted">无需注册即可使用本地空间。<a href={authHref}>登录后同步到其他设备</a></p> : null}</section> : <>{focus ? <section className="ns-focus"><div><span className="ns-eyebrow">{focus.pinned ? '你选择的焦点' : currentAction(workspace,focus.id) ? '继续已有行动' : '从最近想法里，选一个下一步'}</span><h2>{focus.title}</h2>{currentAction(workspace,focus.id) ? <><p className="ns-next-large">{currentAction(workspace,focus.id)!.description}</p><p className="ns-muted">完成标准：{currentAction(workspace,focus.id)!.doneDefinition} · 约 {currentAction(workspace,focus.id)!.estimateMinutes} 分钟</p></> : <p>这个想法还没有下一步。先决定一次愿意投入的小尝试。</p>}<button className="ns-primary" onClick={() => open(focus.id)}>{currentAction(workspace,focus.id)?.status === 'doing' ? '记录行动结果' : currentAction(workspace,focus.id) ? '继续这个行动' : '设定下一步'} →</button></div><span className="ns-focus-art" aria-hidden="true">✦</span></section> : <Empty title="今天可以轻一点" action={<button onClick={() => navigate('ideas')}>看看已有想法</button>}>你可以重新激活一个想法，或记下一点新的念头。</Empty>}<button className="ns-quick-capture" disabled={!!demo} onClick={openCapture}><Icon name="plus"/>刚闪过一个念头？先记下来<span>Ctrl + Enter 保存</span></button><div className="ns-section-title"><h2>最近留下的想法</h2><button onClick={() => navigate('ideas')}>查看全部 →</button></div><div className="ns-card-grid">{workspace.ideas.filter(i => i.status !== '已归档').slice(0,3).map(i => <IdeaCard key={i.id} idea={i} workspace={workspace} open={open}/>)}</div></>}{reminder && stats.completed === 0 && workspace.ideas.length ? <div className="ns-gentle">本周还没有记录行动结果。如果愿意，现在做一次十分钟的小尝试就好。</div> : null}</>}
    {(space.ready || demo) && view === 'ideas' && <><div className="ns-library-tools"><label className="ns-search">搜索想法、行动、结果和证据<input type="search" value={query} placeholder="找回一个想法…" onChange={e => setQuery(e.target.value)}/></label><label>排序<select value={sort} onChange={e => setSort(e.target.value)}><option>最近更新</option><option>创建时间</option><option>标题</option></select></label></div><div className="ns-filters" aria-label="想法筛选">{['全部','待整理','待验证','计划中','行动中','已完成','已搁置','已归档','创作','学习','生活'].map(s => <button key={s} aria-pressed={filter === s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s}</button>)}</div><p className="ns-muted">找到 {shown.length} 个想法 · 空间共 {workspace.ideas.length} 个 <button onClick={() => { setQuery(''); setFilter('全部'); }}>清除筛选</button></p><div className="ns-card-grid">{shown.map(i => <IdeaCard key={i.id} idea={i} workspace={workspace} open={open}/>)}</div>{!shown.length ? <Empty title={workspace.ideas.length ? '暂时没有匹配的想法' : '这里会留下你的方向'} action={<button onClick={openCapture}>记录一个想法</button>}>{workspace.ideas.length ? '试试其他关键词或清除筛选。' : '从一句真实的念头开始，不必急着分类。'}</Empty> : null}<section className="ns-relations"><div className="ns-section-title"><h2>想法之间的连接</h2><button disabled={workspace.ideas.length < 2} onClick={() => setGraphOpen(true)}>打开关系图谱</button></div><p className="ns-muted">基于方向与标签的本地建议，由你决定是否有价值。</p>{pairs.length ? pairs.map(({a,b,reason}) => <div className="ns-relation-row" key={`${a.id}:${b.id}`}><button onClick={() => open(a.id)}>{a.title}</button><span>↔</span><button onClick={() => open(b.id)}>{b.title}</button><small>{reason}</small><button disabled={!!demo} onClick={() => void run('note',{id:crypto.randomUUID(),ideaId:a.id,kind:'结论',content:`与「${b.title}」的关联：${reason}`}).then(() => setNotice('关系已保存为结论')).catch(e => setNotice(e.message))}>保存关联</button></div>) : <p>积累一些想法后，在这里发现可以复用的经验。</p>}</section></>}
    {(space.ready || demo) && view === 'actions' && <><p className="ns-muted">一个想法只突出当前一步。完成后，再决定继续、停下或结束。</p>{active.length > 1 ? <div className="ns-gentle">同时有 {active.length} 个下一步，可以先置顶最想做的一个。</div> : null}<div className="ns-card-grid">{active.map(i => <IdeaCard key={i.id} idea={i} workspace={workspace} open={open}/>)}</div>{!active.length ? <Empty title="从一个小动作开始" action={<button className="ns-primary" onClick={() => navigate('ideas')}>选择一个想法</button>}>定义一件可以实际尝试的事就好。</Empty> : null}<div className="ns-section-title"><h2>已经走过的步骤</h2></div>{workspace.actions.filter(a => a.status === 'done').sort((a,b) => (b.completedAt||0)-(a.completedAt||0)).map(a => <button className="ns-history-row" key={a.id} onClick={() => open(a.ideaId)}><strong>{a.description}</strong><p>{a.outcome}</p>{a.learning ? <small>学到：{a.learning}</small> : null}</button>)}</>}
    {(space.ready || demo) && view === 'review' && <><section className="ns-review-intro"><span className="ns-eyebrow">这一周，有什么发生了变化</span><h2>做过什么，<br/>比想了多少更重要。</h2><p>{new Date(stats.start).toLocaleDateString('zh-CN')} — {new Date(stats.end).toLocaleDateString('zh-CN')} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></section><div className="ns-stats">{[[stats.captured,'新增想法'],[stats.completed,'完成行动'],[stats.learned,'学习记录'],[stats.evidence,'新增证据']].map(([n,label]) => <article key={label}><strong>{n}</strong><span>{label}</span></article>)}</div><section className="ns-panel"><h2>给这一周留几句话</h2><form onSubmit={e => { e.preventDefault(); if (busy) return; setBusy(true); void run('review',{review:{...reviewDraft,id:crypto.randomUUID(),week:stats.start}}).then(() => {setReviewDraft({evidence:'',changed:'',focus:'',next:''});setNotice('复盘已保存');}).catch(e => setNotice(e.message)).finally(() => setBusy(false)); }}>{([['evidence','最重要的新经历或证据'],['changed','哪个判断发生了变化'],['focus','接下来最想投入的方向'],['next','下一步愿意做什么']] as const).map(([key,label]) => <label key={key}>{label}<textarea value={reviewDraft[key]} readOnly={!!demo} onChange={e => setReviewDraft({...reviewDraft,[key]:e.target.value})} maxLength={12000}/></label>)}<button className="ns-primary" disabled={!!demo || busy || !Object.values(reviewDraft).some(Boolean)}>保存这次回顾</button></form></section><div className="ns-section-title"><h2>本周的实际结果</h2></div>{workspace.actions.filter(a => a.status === 'done' && (a.completedAt||0)>=stats.start && (a.completedAt||0)<=stats.end).map(a => <button key={a.id} className="ns-history-row" onClick={() => open(a.ideaId)}><strong>{a.description}</strong><p>{a.outcome}</p></button>)}{workspace.reviews.slice().reverse().map(r => <article className="ns-panel" key={r.id}><small>{new Date(r.createdAt).toLocaleDateString('zh-CN')} 的回顾</small><p>{r.evidence}</p><p>{r.changed}</p><p>下次：{r.focus} {r.next}</p></article>)}</>}
  <footer className="ns-muted" style={{marginTop:48,textAlign:'center'}}>大小王制作</footer></main></div>
  {!captureOpen && !selected && !settingsOpen && !imported && !graphOpen ? <NoticeRegion floating /> : null}
  {captureOpen ? <Modal title="记录一个想法" close={closeCapture}>{captureForm('ns-draft-modal')}</Modal> : null}
  {selected ? <IdeaDetail accountId={user?.id} onlineAccount={!!user} scope={space.scope} key={selected.id} idea={selected} workspace={workspace} close={closeDetail} run={run} demo={!!demo} config={aiConfig} aiEnabled={!!user && (serverAi || !!aiConfig.apiKey)} notify={setNotice}/> : null}
  {settingsOpen ? <Settings authHref={authHref} close={closeSettings} user={user} ready={space.ready} workspace={space.workspace} pending={space.pending} config={aiConfig} serverAi={serverAi} saveConfig={config => {setAiConfig(config);localStorage.setItem('niansheng-ai-preferences',JSON.stringify({provider:config.provider,model:config.model}));}} reminder={reminder} setReminder={value => {setReminder(value);localStorage.setItem('niansheng-weekly-reminder',String(value));}} importFile={async file => {setImported(await readBackupFile(file));setSettingsOpen(false);}} legacy={legacy} importLegacy={() => {setImported(legacy);setSettingsOpen(false);}} notify={setNotice}/> : null}
  {imported ? <Modal title={user ? '确认导入到当前账户' : '确认导入到本地空间'} close={() => setImported(null)}><p>包含 {imported.ideas.length} 个想法、{imported.actions.length} 个行动、{imported.notes.length} 条记录、{imported.events.length} 条历程、{imported.reviews.length} 次复盘。</p><p>{user ? '确认后会上传到当前账户。' : '数据只保存到当前设备。'}使用新 ID，现有内容不会被覆盖。</p>{!space.ready ? <p>当前空间无法读取。确认后会先在本机保留完整原始数据和待同步操作，再从备份恢复；旧待同步操作不会自动发送，可在设置中下载原始数据。</p> : null}<button className="ns-primary" disabled={busy} onClick={() => void confirmImport()}>{busy ? '正在导入…' : '确认导入独立副本'}</button></Modal> : null}
  {graphOpen ? <Suspense fallback={<div className="ns-toast">正在打开图谱…</div>}><FluidGraph accountId={user?.id} analyze={!!user && (serverAi || !!aiConfig.apiKey) && !demo} ideas={workspace.ideas.filter(i => i.status !== '已归档')} config={aiConfig} onClose={() => setGraphOpen(false)} onOpen={idea => {setGraphOpen(false);navigate('ideas',idea.id);}}/></Suspense> : null}
  </div></NoticeContext.Provider>;
}






