'use client';
import { useCallback, useEffect, useState } from 'react';
import { currentAction, intents, safeUrl, type Idea, type Operation, type Workspace } from '../../lib/workspace';
import type { AiConfig } from '../../app/fluid-graph';
import { Modal } from './components';
import { apiMessage, readApi } from '../../lib/api-client';

type Run = (type: Operation['type'], data: Record<string, unknown>, baseVersion?: number) => Promise<void>;
const templates = {
  探索: ['做一次十分钟的小尝试，确认最关键的未知', '留下一个能影响下一步决定的实际结果'],
  创作: ['做出一份可以展示的最小草稿', '保存一份草稿，并写下最想改进的一点'],
  学习: ['练习一个具体知识点，并独立完成一道例题', '不看参考独立完成一次，并记录卡住的地方'],
  生活: ['在下一个合适的时刻，尝试一次新的做法', '实际尝试一次，记录体验及是否愿意继续'],
};
export default function IdeaDetail({ idea, workspace, close, run, demo, config, aiEnabled, notify, scope, onlineAccount, accountId }: { idea: Idea; workspace: Workspace; close: () => void; run: Run; demo: boolean; config: AiConfig; aiEnabled: boolean; notify: (message: string) => void; scope: string; onlineAccount: boolean; accountId?: string }) {
  const [tab, setTab] = useState<'next' | 'edit' | 'notes' | 'ai'>('next');
  const [edit, setEdit] = useState({ title: idea.title, content: idea.content, tags: idea.tags.join('，'), intent: idea.intent });
  const [editVersion, setEditVersion] = useState(idea.version);
  const [editDirty, setEditDirty] = useState(false);
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [actionDraft, setActionDraft] = useState({ description: '', doneDefinition: '', estimateMinutes: 15 });
  const [outcome, setOutcome] = useState(''); const [learning, setLearning] = useState('');
  const [note, setNote] = useState(''); const [url, setUrl] = useState(''); const [kind, setKind] = useState('结论');
  const [reason, setReason] = useState(''); const [question, setQuestion] = useState(''); const [mode, setMode] = useState('帮我澄清');
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false);
  const [learningDrafts, setLearningDrafts] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<{title:string;url:string;source:string}[]>([]);
  const [researchTerm, setResearchTerm] = useState(idea.title);
  useEffect(() => {
    if (!demo) {
      try {
        const saved = JSON.parse(localStorage.getItem(`niansheng-detail:${scope}:${idea.id}`) || 'null');
        if (saved) {
          if (saved.editDirty && saved.edit && typeof saved.edit.title === 'string' && typeof saved.edit.content === 'string') { setEdit(saved.edit); setEditDirty(true); setEditVersion(typeof saved.editVersion === 'number' ? saved.editVersion : idea.version); }
          if (saved.actionDraft) setActionDraft(saved.actionDraft);
          for (const [key, setter] of [['outcome',setOutcome],['learning',setLearning],['note',setNote],['url',setUrl],['reason',setReason],['question',setQuestion]] as const) if(typeof saved[key] === 'string') setter(saved[key]);
        }
      } catch { notify('上次表单草稿无法恢复，已有记录未受影响'); }
    }
    setLoadedDraft(true);
  }, [demo, idea.id, scope]); // Keep a dirty form tied to the version it originally edited.
  useEffect(() => {
    if (!loadedDraft || demo) return;
    try { localStorage.setItem(`niansheng-detail:${scope}:${idea.id}`,JSON.stringify({edit,editVersion,editDirty,actionDraft,outcome,learning,note,url,reason,question})); }
    catch { notify('表单草稿暂未持久保存，请勿关闭页面'); }
  }, [loadedDraft,demo,scope,idea.id,edit,editVersion,editDirty,actionDraft,outcome,learning,note,url,reason,question,notify]);
  useEffect(() => {
    if (loadedDraft && !editDirty) { setEdit({ title:idea.title,content:idea.content,tags:idea.tags.join('，'),intent:idea.intent });setEditVersion(idea.version); }
  }, [idea.title,idea.content,idea.tags,idea.intent,idea.version,editDirty,loadedDraft]);
  const updateEdit = (update: (value: typeof edit) => typeof edit) => { setEdit(update);setEditDirty(true); };
  const closeStable = useCallback(() => close(), [close]);
  const action = currentAction(workspace, idea.id);
  const execute = async (task: () => Promise<void>, message = '已保存在本机') => {
    if (busy) return; setBusy(true);
    try { await task(); notify(message); } catch (e) { notify(e instanceof Error ? e.message : '保存失败，输入已保留'); } finally { setBusy(false); }
  };
  const editIdea = (values: Record<string, unknown>) => run('edit', { ideaId: idea.id, title: idea.title, content: idea.content, tags: idea.tags, intent: idea.intent, ...values }, idea.version);
  const changeStatus = (status: string) => execute(() => run('status', { ideaId: idea.id, status, reason }, idea.version));
  async function ask() {
    await execute(async () => {
      const context = workspace.actions.filter(a=>a.ideaId===idea.id && a.status==='done').slice(-4).map(a=>`${a.description}；结果：${a.outcome}；学习：${a.learning}`).join('\n').slice(0,5000);
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(accountId ? { 'X-Niansheng-Account': encodeURIComponent(accountId) } : {}), ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) }, body: JSON.stringify({ action: 'chat', provider: config.provider, model: config.model, idea:{...idea,content:`${idea.content.slice(0,12000)}\n\n已完成的行动记录：\n${context}`}, question: `${mode}：${question || '请根据当前想法给出一个具体建议'}` }), signal: AbortSignal.timeout(50000) });
      const result = await readApi(response);
      if (!response.ok) throw new Error(apiMessage(result, 'AI 暂不可用；记录与行动仍可继续'));
      if (typeof result.reply !== 'string') throw new Error('模型返回格式无效，请重试');
      setReply(result.reply);
      await run('note', { id: crypto.randomUUID(), ideaId: idea.id, kind: '讨论', content: `提问：${mode} ${question}\n\nAI 建议：${result.reply}`, source: 'AI' });
    }, '讨论已保存；AI 建议需要由你判断');
  }
  async function research() {
    await execute(async()=>{
      const response=await fetch(`/api/research?q=${encodeURIComponent(researchTerm)}`,{headers: accountId ? { 'X-Niansheng-Account': encodeURIComponent(accountId) } : {},signal:AbortSignal.timeout(15000)});
      const result=await readApi(response);
      if(!response.ok)throw new Error(apiMessage(result,'暂时无法获取公开资料'));
      const items=Array.isArray(result.items)?result.items:[];
      setSources(items.flatMap(value=>{const item=value&&typeof value==='object'?value as Record<string,unknown>:{};const url=safeUrl(item.url);return typeof item.title==='string'&&url?[{title:item.title,url,source:typeof item.source==='string'?item.source:'公开来源'}]:[];}));
      if(!items.length)notify('没有找到相关公开资讯，可以手动保存自己的来源链接');
    },'公开资料仅作为线索，请打开原文核实');
  }
  const inactive = ['已归档', '已完成', '已搁置'].includes(idea.status);
  return <Modal title={idea.title} close={closeStable} wide><div className="ns-detail-meta"><span>{idea.intent} · {idea.status}</span><button disabled={busy || demo} onClick={() => void execute(() => editIdea({ pinned: !idea.pinned }))}>{idea.pinned ? '取消置顶' : '置为焦点'}</button></div><nav className="ns-detail-tabs" aria-label="想法详情">{([['next', '下一步'], ['edit', '原文与整理'], ['notes', '记录与历程'], ['ai', '思考伙伴']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {demo ? <div className="ns-gentle">这是只读示例。回到我的空间后，可以推进自己的想法。</div> : null}
    {tab === 'next' && <div className="ns-detail-body">
      {inactive ? <section className="ns-panel"><h3>{idea.status === '已归档' ? '这个想法已归档' : '这个方向暂时告一段落'}</h3><p>记录和已经完成的步骤仍在，可以随时重新开始。</p><button className="ns-primary" disabled={busy || demo} onClick={() => void changeStatus('待验证')}>重新激活</button></section> : action ? <section className="ns-panel ns-action-panel"><span className="ns-eyebrow">{action.status === 'doing' ? '正在进行' : '当前下一步'}</span><h3>{action.description}</h3><p>完成标准：{action.doneDefinition}</p><small>约 {action.estimateMinutes} 分钟</small>{action.status === 'todo' ? <button className="ns-primary" disabled={busy || demo} onClick={() => void execute(() => run('action.update', { ideaId: idea.id, id: action.id, status: 'doing' }, action.version), '行动已开始，本机已保存')}>开始这个行动</button> : null}<form onSubmit={e => { e.preventDefault(); void execute(async () => { await run('action.update', { ideaId: idea.id, id: action.id, status: 'done', outcome, learning }, action.version); setOutcome(''); setLearning(''); }, '这一步已完成。你可以继续下一步，也可以停下来。'); }}><label>实际发生了什么？<textarea required placeholder="一句实际结果就好，失败或无结论也可以" value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={12000} /></label><label>我学到了什么（可稍后补充）<textarea value={learning} onChange={e => setLearning(e.target.value)} maxLength={12000} /></label><button className="ns-primary" disabled={busy || demo || !outcome.trim()}>记录结果并完成这一步</button><button type="button" disabled={busy || demo} onClick={() => void execute(() => run('action.update', { ideaId: idea.id, id: action.id, status: 'cancelled' }, action.version))}>取消当前行动</button></form></section> : <section className="ns-panel"><h3>下一次，愿意试试什么？</h3><p>不需要完整计划，定义一个真实可以完成的小动作。</p><button className="ns-template" onClick={() => setActionDraft({ description: templates[idea.intent][0], doneDefinition: templates[idea.intent][1], estimateMinutes: 15 })}>用一个{idea.intent}小模板起步</button><form onSubmit={e => { e.preventDefault(); void execute(async () => { await run('action.create', { ideaId: idea.id, id: crypto.randomUUID(), ...actionDraft }, idea.version); setActionDraft({ description: '', doneDefinition: '', estimateMinutes: 15 }); }); }}><label>做什么<input required value={actionDraft.description} onChange={e => setActionDraft(v => ({ ...v, description: e.target.value }))} maxLength={500} /></label><label>怎样算做完<input required value={actionDraft.doneDefinition} onChange={e => setActionDraft(v => ({ ...v, doneDefinition: e.target.value }))} maxLength={500} /></label><label>预计分钟数<input type="number" min={5} max={1440} value={actionDraft.estimateMinutes} onChange={e => setActionDraft(v => ({ ...v, estimateMinutes: Number(e.target.value) }))} /></label><button className="ns-primary" disabled={busy || demo}>保存下一步</button></form></section>}
      <details className="ns-panel"><summary>继续、停下，还是结束这个方向</summary><p>完成一步不代表整个想法结束。证伪、暂缓或停止投入，都可以留下有价值的结果。</p><label>原因或最后的结果<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={12000} /></label><div className="ns-button-row"><button disabled={busy || demo} onClick={() => void changeStatus('待验证')}>继续探索</button><button disabled={busy || demo} onClick={() => void changeStatus('已搁置')}>暂时搁置</button><button disabled={busy || demo} onClick={() => void changeStatus('已完成')}>结束这个方向</button><button disabled={busy || demo} onClick={() => void changeStatus('已归档')}>归档并保留记录</button></div><small>搁置、结束或归档会取消尚未完成的当前行动，已完成记录会保留。</small></details>
      <h3>已经走过的步骤</h3>{workspace.actions.filter(a => a.ideaId === idea.id && ['done','cancelled'].includes(a.status)).slice().reverse().map(a => <article className="ns-history-row" key={a.id}><strong>{a.description} · {a.status === 'done' ? '已完成' : '已取消'}</strong><p>{a.outcome}</p>{a.learning ? <p>学到：{a.learning}</p> : null}{a.status === 'done' ? <form onSubmit={e => { e.preventDefault(); void execute(() => run('action.update', { ideaId: idea.id, id: a.id, status: 'done', outcome: a.outcome, learning: learningDrafts[a.id] ?? a.learning }, a.version), '学习已补充，原完成时间保持不变'); }}><label>补充或修改这一步的学习<textarea value={learningDrafts[a.id] ?? a.learning} onChange={e => setLearningDrafts(v => ({ ...v, [a.id]: e.target.value }))} /></label><button disabled={busy || demo}>保存学习</button></form> : null}</article>)}
    </div>}
    {tab === 'edit' && <form className="ns-detail-body" onSubmit={e => { e.preventDefault(); void execute(async () => { await run('edit', { ideaId: idea.id, ...edit, tags: edit.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) }, editVersion); setEditVersion(editVersion + 1); setEditDirty(false); }); }}><label>标题<input required value={edit.title} maxLength={160} onChange={e => updateEdit(v => ({ ...v, title: e.target.value }))} /></label><label>原始想法<textarea required className="ns-long-text" value={edit.content} maxLength={12000} onChange={e => updateEdit(v => ({ ...v, content: e.target.value }))} /></label><label>这个方向更接近<select value={edit.intent} onChange={e => updateEdit(v => ({ ...v, intent: e.target.value as Idea['intent'] }))}>{intents.map(i => <option key={i}>{i}</option>)}</select></label><label>标签，用逗号分隔<input value={edit.tags} onChange={e => updateEdit(v => ({ ...v, tags: e.target.value }))} /></label><button className="ns-primary" disabled={busy || demo}>保存整理</button><p className="ns-muted">原文由你编辑。AI 建议保存在讨论记录中，不会自动覆盖。</p></form>}
    {tab === 'notes' && <div className="ns-detail-body"><form className="ns-panel" onSubmit={e => { e.preventDefault(); void execute(async () => { await run('note', { id: crypto.randomUUID(), ideaId: idea.id, kind, content: note, url }); setNote(''); setUrl(''); }); }}><label>记录类型<select value={kind} onChange={e => setKind(e.target.value)}><option>结论</option><option>证据</option></select></label><label>留下什么<textarea required value={note} onChange={e => setNote(e.target.value)} maxLength={12000} /></label><label>来源链接（可选）<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label><button className="ns-primary" disabled={busy || demo}>保存记录</button></form>{workspace.notes.filter(n => n.ideaId === idea.id).slice().reverse().map(n => <article className="ns-panel" key={n.id}><small>{n.kind} · {n.source} · {new Date(n.createdAt).toLocaleString('zh-CN')}</small><p className="ns-prewrap">{n.content}</p>{n.url ? <a href={n.url} target="_blank" rel="noreferrer">查看来源 ↗</a> : null}</article>)}<details className="ns-panel"><summary>查找公开参考资料（可选）</summary><p>仅作为线索，打开原文核实后，再说明它支持或反驳什么。</p><label>搜索关键词<input value={researchTerm} maxLength={120} onChange={e => setResearchTerm(e.target.value)}/></label><button disabled={busy || demo || !onlineAccount || !researchTerm.trim()} onClick={() => void research()}>检索公开资讯</button>{!onlineAccount ? <small>登录后可使用本站检索，仍可以手动保存链接。</small> : null}{sources.map(source => <article key={source.url} className="ns-history-row"><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><small>{source.source}</small><button disabled={busy || demo} onClick={() => void execute(() => run('note',{id:crypto.randomUUID(),ideaId:idea.id,kind:'证据',content:`待核实的参考线索：${source.title}`,url:source.url}))}>保存为待核实资料</button></article>)}</details><h3>操作历程</h3>
      {workspace.events.filter(e => e.ideaId === idea.id).slice().reverse().map(event => (
        <article key={event.id}>
          <p className="ns-timeline"><span>{event.kind}</span><small>{new Date(event.at).toLocaleString('zh-CN')}</small></p>
          {event.reason ? <p className="ns-prewrap">{event.reason}</p> : null}
          {event.goal ? <p className="ns-prewrap">当时的目标 · {event.goal}</p> : null}
          {event.before ? <details>
            <summary>查看修改前的原文</summary>
            <h4>{event.before.title}</h4><p className="ns-prewrap">{event.before.content}</p>
            <button disabled={busy || demo} onClick={() => void execute(() => editIdea(event.before!))}>将这版恢复为当前内容</button>
          </details> : null}
          {event.after ? <details>
            <summary>查看当时修改后的原文</summary>
            <h4>{event.after.title}</h4><p className="ns-prewrap">{event.after.content}</p>
          </details> : null}
        </article>
      ))}
    </div>}
    {tab === 'ai' && <div className="ns-detail-body"><p>先理解你的意图，再一起思考。建议会保存为讨论记录，由你决定是否采用。</p>{!aiEnabled ? <div className="ns-gentle">AI 未连接。登录后在设置中连接模型，或直接使用下一步和记录功能。</div> : null}<label>这次想怎么聊<select value={mode} onChange={e => setMode(e.target.value)}><option>帮我澄清</option><option>给我下一步</option><option>挑战我的假设</option></select></label><label>补充一点上下文<textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={3000} /></label><button className="ns-primary" disabled={busy || demo || !aiEnabled} onClick={() => void ask()}>{busy ? '正在思考…' : '请思考伙伴帮忙'}</button>{reply ? <article className="ns-panel"><small>AI 建议 · 已保存到讨论记录</small><p className="ns-prewrap">{reply}</p><button disabled={busy || demo} onClick={() => void execute(() => run('note', { id: crypto.randomUUID(), ideaId: idea.id, kind: '结论', content: reply, source: 'AI' }))}>保留为结论</button><button onClick={() => { setActionDraft(v => ({ ...v, description: reply.slice(0, 500) })); setTab('next'); }}>用作下一步草稿</button></article> : null}</div>}
  </Modal>;
}





