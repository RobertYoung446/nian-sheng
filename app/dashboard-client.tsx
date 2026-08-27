"use client";

import { useEffect, useState } from "react";
import FluidGraph, { type AiConfig } from "./fluid-graph";

type Idea = {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  status: string;
  feasibility: number;
  impact: number;
  clarity: number;
  confidence: number;
  risk: string;
  nextAction: string;
  createdAt: number;
  updatedAt: number;
};
type Research = { title: string; url: string; date: string; source: string };
type View = "today" | "inbox" | "ideas" | "network" | "projects" | "review";

const nav: { id: View; icon: string; label: string }[] = [
  { id: "today", icon: "⌂", label: "今日工作台" },
  { id: "inbox", icon: "⌁", label: "灵感收件箱" },
  { id: "ideas", icon: "◫", label: "想法库" },
  { id: "network", icon: "⌘", label: "关系图谱" },
  { id: "projects", icon: "✓", label: "行动项目" },
  { id: "review", icon: "↗", label: "复盘中心" },
];

const samples: Idea[] = [
  {
    id: "sample-1",
    title: "让独立创作者更轻松地验证产品方向",
    content: "为独立创作者设计一套轻量的产品验证方法，帮助他们更快判断方向。",
    summary: "把模糊的产品直觉变成一套可执行、可衡量的验证流程。",
    tags: ["产品", "创作"],
    status: "待验证",
    feasibility: 84,
    impact: 88,
    clarity: 76,
    confidence: 79,
    risk: "“创作者缺少验证方法”不等于他们愿意改变现在的做法。",
    nextAction: "联系 3 位独立创作者，询问他们最近一次放弃产品想法的原因。",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "sample-2",
    title: "用声音记录城市里正在消失的空间",
    content: "收集街区记忆、环境声音与个人故事，做成可探索的声音地图。",
    summary: "通过声音档案保存城市空间的集体记忆。",
    tags: ["内容", "城市"],
    status: "计划中",
    feasibility: 72,
    impact: 81,
    clarity: 69,
    confidence: 68,
    risk: "素材采集与授权成本可能高于预期。",
    nextAction: "选一个街区，录制 3 段声音并邀请 5 人试听。",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: "sample-3",
    title: "每周一封写给未来自己的进度信",
    content: "每周固定回顾进展，用一封信记录成长和下一步。",
    summary: "用低压力的固定仪式建立长期复盘习惯。",
    tags: ["生活", "复盘"],
    status: "行动中",
    feasibility: 91,
    impact: 67,
    clarity: 88,
    confidence: 82,
    risk: "如果流程太复杂，两周后可能中断。",
    nextAction: "本周日写第一封不超过 300 字的进度信。",
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
];

export default function Dashboard({ name }: { name: string }) {
  const [view, setView] = useState<View>("today");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Idea | null>(null);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("全部");
  const [showAi, setShowAi] = useState(false);
  const [serverAi, setServerAi] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: "openai",
    model: "gpt-4.1-mini",
    apiKey: "",
  });

  useEffect(() => {
    fetch("/api/ideas")
      .then((r) => r.json())
      .then((data) => setIdeas(data.ideas || []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((data) => {
        setServerAi(Boolean(data.serverConfigured));
        if (data.model)
          setAiConfig((current) => ({ ...current, model: data.model }));
        if (
          data.provider &&
          ["openai", "deepseek", "openrouter"].includes(data.provider)
        )
          setAiConfig((current) => ({ ...current, provider: data.provider }));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const displayIdeas = ideas.length ? ideas : samples;
  const realCount = ideas.length;
  const focus =
    displayIdeas.find((i) =>
      ["行动中", "待验证", "计划中"].includes(i.status),
    ) || displayIdeas[0];
  const avg = (key: "feasibility" | "impact" | "clarity") =>
    Math.round(
      displayIdeas.reduce((a, i) => a + i[key], 0) / displayIdeas.length,
    );

  async function capture() {
    if (!draft.trim()) {
      setToast("先写下一点什么吧");
      return;
    }
    setSaving(true);
    try {
      const original = draft;
      const r = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: original }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      let saved: Idea = data.idea;
      setIdeas((current) => [saved, ...current]);
      setDraft("");
      setSelected(saved);
      setToast("想法已保存，正在请模型深入分析");
      const ai = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(aiConfig.apiKey
            ? { Authorization: `Bearer ${aiConfig.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          action: "analyze",
          provider: aiConfig.provider,
          model: aiConfig.model,
          idea: { content: original },
        }),
      });
      if (ai.ok) {
        const result = await ai.json();
        const update = await fetch("/api/ideas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: saved.id, analysis: result.result }),
        });
        if (update.ok) {
          saved = (await update.json()).idea;
          setIdeas((current) =>
            current.map((item) => (item.id === saved.id ? saved : item)),
          );
          setSelected(saved);
          setToast("真实大模型分析已完成");
        }
      } else setToast("已使用内置引擎分析；可在右上角连接真实模型");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }
  async function changeStatus(idea: Idea, status: string) {
    if (idea.id.startsWith("sample")) {
      setToast("这是体验示例，记录自己的想法后即可推进");
      return;
    }
    await fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idea.id, status }),
    });
    setIdeas((current) =>
      current.map((i) =>
        i.id === idea.id ? { ...i, status, updatedAt: Date.now() } : i,
      ),
    );
    setSelected((current) =>
      current?.id === idea.id ? { ...current, status } : current,
    );
    setToast(`已进入「${status}」`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand pressable" onClick={() => setView("today")}>
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            念生<small>IDEAS INTO LIFE</small>
          </span>
        </button>
        <nav aria-label="主导航">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`nav-item pressable ${view === item.id ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === "inbox" && realCount > 0 ? <b>{realCount}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="streak">
            <small>本周推进</small>
            <strong>
              {Math.min(realCount, 7)} <span>个想法</span>
            </strong>
            <div>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <i
                  className={i < Math.min(realCount, 7) ? "lit" : ""}
                  key={i}
                />
              ))}
            </div>
          </div>
          <a className="profile" href="/signout-with-chatgpt?return_to=/">
            <span>{name.slice(0, 1).toUpperCase()}</span>
            <span>
              {name}
              <small>点击退出</small>
            </span>
            <b>•••</b>
          </a>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{dateLine()}</p>
            <h1>{headlines[view]}</h1>
          </div>
          <div className="top-actions">
            <button
              className={`ai-connect pressable ${serverAi || aiConfig.apiKey ? "ready" : ""}`}
              onClick={() => setShowAi(true)}
            >
              <i /> AI 接口
            </button>
            <button
              className="capture pressable"
              onClick={() => {
                setView("today");
                setTimeout(
                  () => document.querySelector("textarea")?.focus(),
                  0,
                );
              }}
            >
              ＋ 记录想法
            </button>
          </div>
        </header>
        {view === "today" && (
          <Today
            name={name}
            draft={draft}
            setDraft={setDraft}
            save={capture}
            saving={saving}
            focus={focus}
            ideas={displayIdeas}
            open={setSelected}
            realCount={realCount}
          />
        )}
        {view === "inbox" && (
          <Inbox
            ideas={displayIdeas}
            open={setSelected}
            changeStatus={changeStatus}
          />
        )}
        {view === "ideas" && (
          <Library
            ideas={displayIdeas}
            open={setSelected}
            filter={filter}
            setFilter={setFilter}
          />
        )}
        {view === "network" && (
          <Network
            ideas={displayIdeas}
            open={setSelected}
            aiConfig={aiConfig}
          />
        )}
        {view === "projects" && (
          <Projects
            ideas={displayIdeas}
            open={setSelected}
            changeStatus={changeStatus}
          />
        )}
        {view === "review" && (
          <Review
            ideas={displayIdeas}
            counts={realCount}
            avg={{
              feasibility: avg("feasibility"),
              impact: avg("impact"),
              clarity: avg("clarity"),
            }}
          />
        )}
      </section>
      {selected && (
        <IdeaPanel
          idea={selected}
          close={() => setSelected(null)}
          changeStatus={changeStatus}
          aiConfig={aiConfig}
        />
      )}
      {showAi && (
        <AiSettings
          config={aiConfig}
          serverAi={serverAi}
          close={() => setShowAi(false)}
          save={(config) => {
            setAiConfig(config);
            setShowAi(false);
            setToast(
              config.apiKey
                ? "真实大模型已连接（密钥仅保留到本次页面关闭）"
                : "将优先使用站点模型或内置引擎",
            );
          }}
        />
      )}
      {loading && <div className="loading-pill">正在整理你的想法…</div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

const headlines: Record<View, string> = {
  today: "今天想推动什么？",
  inbox: "先收下，再慢慢想清楚",
  ideas: "你的想法，都在这里生长",
  network: "看见想法之间隐藏的连接",
  projects: "把值得做的事，一步步完成",
  review: "从行动里，看见自己的方向",
};
function dateLine() {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}
function timeAgo(ts: number) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  return d === 0 ? "今天" : `${d} 天前`;
}

function Capture({
  draft,
  setDraft,
  save,
  saving,
}: {
  draft: string;
  setDraft: (s: string) => void;
  save: () => void;
  saving: boolean;
}) {
  return (
    <section className="capture-card">
      <div className="capture-title">
        <span>✦</span>
        <div>
          <h2>捕捉刚刚闪过的念头</h2>
          <p>不用整理，先把它留下来，系统会自动分析</p>
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
        }}
        aria-label="记录新想法"
        placeholder="我刚想到……"
      />
      <div className="capture-tools">
        <div>
          <span>可以写目标、问题、方案，甚至只是一句模糊的直觉</span>
        </div>
        <button className="save" disabled={saving} onClick={save}>
          {saving ? "正在理解…" : "收进灵感箱"} <span>⌘ ↵</span>
        </button>
      </div>
    </section>
  );
}

function Today({
  name,
  draft,
  setDraft,
  save,
  saving,
  focus,
  ideas,
  open,
  realCount,
}: {
  name: string;
  draft: string;
  setDraft: (s: string) => void;
  save: () => void;
  saving: boolean;
  focus: Idea;
  ideas: Idea[];
  open: (i: Idea) => void;
  realCount: number;
}) {
  return (
    <>
      <div className="welcome">
        <span>✦</span>
        <p>
          {realCount
            ? `${name}，你已经留下 ${realCount} 个真实想法。今天选择一个最小动作就好。`
            : "这里是你的想法工作台。先记下一件最近反复出现的念头，看看它是否值得做。"}
        </p>
      </div>
      <Capture {...{ draft, setDraft, save, saving }} />
      <div className="section-heading">
        <div>
          <h2>此刻最值得推进</h2>
          <p>根据可行性、影响力与当前状态整理</p>
        </div>
        <button onClick={() => open(focus)}>查看完整分析 →</button>
      </div>
      <section className="focus-card">
        <div className="focus-main">
          <div className="eyebrow">
            <span>本周焦点</span>
            <small>{focus.status}</small>
          </div>
          <h2>{focus.title}</h2>
          <p>{focus.summary}</p>
          <Metric label="想法成熟度" value={focus.confidence} />
          <div className="next-action">
            <span>下一步最小行动</span>
            <p>{focus.nextAction}</p>
            <button onClick={() => open(focus)}>开始行动 →</button>
          </div>
        </div>
        <aside className="ai-note">
          <span className="ai-icon">✦</span>
          <small>思考伙伴的提醒</small>
          <h3>别急着证明它是对的</h3>
          <p>{focus.risk}</p>
          <button onClick={() => open(focus)}>展开质疑</button>
        </aside>
      </section>
      <div className="section-heading compact">
        <div>
          <h2>最近的想法</h2>
          <p>{ideas.length} 个方向正在等待你的选择</p>
        </div>
        <button>查看全部 →</button>
      </div>
      <section className="idea-grid">
        {ideas.slice(0, 3).map((i) => (
          <IdeaCard key={i.id} idea={i} open={open} />
        ))}
      </section>
    </>
  );
}

function Inbox({
  ideas,
  open,
  changeStatus,
}: {
  ideas: Idea[];
  open: (i: Idea) => void;
  changeStatus: (i: Idea, s: string) => void;
}) {
  return (
    <section className="view-card">
      <div className="view-intro">
        <div>
          <span className="kicker">CAPTURE → CLARIFY</span>
          <h2>{ideas.length} 个想法等待整理</h2>
          <p>先看分析提炼，再决定验证、推进还是搁置。</p>
        </div>
        <div className="big-number">
          {ideas.length}
          <small>IDEAS</small>
        </div>
      </div>
      <div className="inbox-list">
        {ideas.map((i) => (
          <article key={i.id}>
            <button className="inbox-main" onClick={() => open(i)}>
              <div>
                <span className="status-dot" />
                <h3>{i.title}</h3>
                <p>{i.summary}</p>
              </div>
              <small>{timeAgo(i.updatedAt)}</small>
            </button>
            <div className="row-actions">
              <span>{i.tags.join(" · ")}</span>
              <button onClick={() => changeStatus(i, "待验证")}>去验证</button>
              <button onClick={() => changeStatus(i, "已搁置")}>搁置</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Library({
  ideas,
  open,
  filter,
  setFilter,
}: {
  ideas: Idea[];
  open: (i: Idea) => void;
  filter: string;
  setFilter: (s: string) => void;
}) {
  const statuses = ["全部", "待验证", "计划中", "行动中", "已完成", "已搁置"];
  const shown =
    filter === "全部" ? ideas : ideas.filter((i) => i.status === filter);
  return (
    <>
      <div className="filterbar">
        {statuses.map((s) => (
          <button
            className={filter === s ? "active" : ""}
            key={s}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <section className="library-grid">
        {shown.map((i) => (
          <IdeaCard key={i.id} idea={i} open={open} detailed />
        ))}
        {!shown.length && (
          <div className="empty">
            这个阶段还没有想法。
            <br />
            这也意味着你可以更专注。
          </div>
        )}
      </section>
    </>
  );
}

function Network({
  ideas,
  open,
  aiConfig,
}: {
  ideas: Idea[];
  open: (i: Idea) => void;
  aiConfig: AiConfig;
}) {
  const [full, setFull] = useState(false);
  const tags = [...new Set(ideas.flatMap((i) => i.tags))];
  return (
    <>
      <section className="network-view glass-stage">
        <div className="network-copy">
          <span className="kicker">AI IDEA OCEAN</span>
          <h2>
            想法会像海面上的岛屿
            <br />
            自己找到彼此
          </h2>
          <p>
            真实大模型会判断相似、依赖、先后、包含、互补与冲突关系，并自主编排关系网络。
          </p>
          <button
            className="open-ocean pressable"
            onClick={() => setFull(true)}
          >
            进入全屏关系海 <span>↗</span>
          </button>
        </div>
        <button
          className="ocean-preview pressable"
          onClick={() => setFull(true)}
          aria-label="打开全屏想法关系图谱"
        >
          <div className="preview-water">
            <i />
            <i />
            <i />
          </div>
          {ideas.slice(0, 5).map((idea, index) => (
            <span className={`preview-node p${index}`} key={idea.id}>
              {idea.tags[0] || "想法"}
              <b>{idea.title}</b>
            </span>
          ))}
          <em>长按拖动探索</em>
        </button>
        <div className="network-insight">
          <span>✦ AI 关系引擎</span>
          <p>
            {ideas.length > 1
              ? `将分析 ${ideas.length} 个想法与 ${tags.length} 个主题，不再只依赖相同标签。`
              : "继续记录后，模型会自动发现想法间的逻辑关系。"}
          </p>
        </div>
      </section>
      {full && (
        <FluidGraph
          ideas={ideas}
          config={aiConfig}
          onClose={() => setFull(false)}
          onOpen={(idea) => {
            setFull(false);
            open(idea as Idea);
          }}
        />
      )}
    </>
  );
}

function Projects({
  ideas,
  open,
  changeStatus,
}: {
  ideas: Idea[];
  open: (i: Idea) => void;
  changeStatus: (i: Idea, s: string) => void;
}) {
  const active = ideas.filter((i) =>
    ["计划中", "行动中", "待验证"].includes(i.status),
  );
  return (
    <section>
      <div className="kanban-head">
        <div>
          <span className="kicker">FROM IDEA TO ACTION</span>
          <h2>每个项目，只突出下一步</h2>
        </div>
        <p>
          {active.length} 个方向 ·{" "}
          {active.filter((i) => i.status === "行动中").length} 个正在行动
        </p>
      </div>
      <div className="kanban">
        {["待验证", "计划中", "行动中"].map((status) => (
          <section key={status}>
            <header>
              <span>{status}</span>
              <b>{active.filter((i) => i.status === status).length}</b>
            </header>
            {active
              .filter((i) => i.status === status)
              .map((i) => (
                <article key={i.id}>
                  <button onClick={() => open(i)}>
                    <small>{i.tags[0] || "想法"}</small>
                    <h3>{i.title}</h3>
                    <p>下一步：{i.nextAction}</p>
                  </button>
                  <div>
                    <Metric label="成熟度" value={i.confidence} />
                    <select
                      value={i.status}
                      onChange={(e) => changeStatus(i, e.target.value)}
                      aria-label="更改状态"
                    >
                      <option>待验证</option>
                      <option>计划中</option>
                      <option>行动中</option>
                      <option>已完成</option>
                    </select>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function Review({
  ideas,
  counts,
  avg,
}: {
  ideas: Idea[];
  counts: number;
  avg: { feasibility: number; impact: number; clarity: number };
}) {
  const complete = ideas.filter((i) => i.status === "已完成").length;
  return (
    <section className="review-view">
      <div className="review-hero">
        <div>
          <span className="kicker">WEEKLY REVIEW</span>
          <h2>
            你不需要做完所有想法
            <br />
            只需要看清真正重要的。
          </h2>
          <p>这是根据最近记录和推进情况生成的本周复盘。</p>
        </div>
        <div
          className="review-ring"
          style={
            { "--score": `${avg.clarity * 3.6}deg` } as React.CSSProperties
          }
        >
          <strong>{avg.clarity}</strong>
          <small>方向清晰度</small>
        </div>
      </div>
      <div className="review-stats">
        <article>
          <small>本周新增</small>
          <strong>{counts}</strong>
          <p>个真实想法</p>
        </article>
        <article>
          <small>正在推进</small>
          <strong>{ideas.filter((i) => i.status === "行动中").length}</strong>
          <p>保持聚焦</p>
        </article>
        <article>
          <small>已经完成</small>
          <strong>{complete}</strong>
          <p>值得庆祝</p>
        </article>
        <article>
          <small>平均可行性</small>
          <strong>{avg.feasibility}</strong>
          <p>综合评分</p>
        </article>
      </div>
      <div className="review-grid">
        <article>
          <span>✦ 本周观察</span>
          <h3>
            {counts
              ? "你开始把模糊的念头变成可讨论的对象。"
              : "你还在准备阶段，而第一条记录就是最重要的开始。"}
          </h3>
          <p>
            {counts
              ? "下一周不要增加更多项目，先完成一个用户验证。你的想法整体清晰度不错，但“真实需求”仍是共同风险。"
              : "记录一个你最近三次想到的问题。不必完整，只要真实。"}
          </p>
        </article>
        <article>
          <span>下周建议</span>
          <ol>
            <li>只选择一个想法进入行动中</li>
            <li>安排一次不超过 30 分钟的真实验证</li>
            <li>周日回来记录：我学到了什么？</li>
          </ol>
        </article>
      </div>
    </section>
  );
}

function IdeaCard({
  idea,
  open,
  detailed = false,
}: {
  idea: Idea;
  open: (i: Idea) => void;
  detailed?: boolean;
}) {
  return (
    <button
      className={`idea-card ${detailed ? "detailed" : ""}`}
      onClick={() => open(idea)}
    >
      <div className="idea-meta">
        <span>{idea.tags[0] || "想法"}</span>
        <small>{timeAgo(idea.updatedAt)}</small>
      </div>
      <h3>{idea.title}</h3>
      <p>{idea.summary}</p>
      {detailed && (
        <div className="status-line">
          <b>{idea.status}</b>
          <span>
            {idea.tags
              .slice(1)
              .map((t) => `#${t}`)
              .join(" ")}
          </span>
        </div>
      )}
      <Metric label="AI 可行性" value={idea.feasibility} />
    </button>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function IdeaPanel({
  idea,
  close,
  changeStatus,
  aiConfig,
}: {
  idea: Idea;
  close: () => void;
  changeStatus: (i: Idea, s: string) => void;
  aiConfig: AiConfig;
}) {
  const [tab, setTab] = useState<"analysis" | "talk" | "research">("analysis");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [news, setNews] = useState<Research[]>([]);
  const [researching, setResearching] = useState(false);
  const [thinking, setThinking] = useState(false);
  async function ask() {
    if (!question.trim() || thinking) return;
    const q = question;
    setMessages((m) => [...m, { role: "you", text: q }]);
    setQuestion("");
    setThinking(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(aiConfig.apiKey
            ? { Authorization: `Bearer ${aiConfig.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          action: "chat",
          provider: aiConfig.provider,
          model: aiConfig.model,
          idea,
          messages: messages.map((message) => ({
            role: message.role === "you" ? "user" : "assistant",
            content: message.text,
          })),
          question: q,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setMessages((m) => [...m, { role: "ai", text: data.reply }]);
      } else
        setMessages((m) => [
          ...m,
          { role: "ai", text: challengeAnswer(q, idea) },
        ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "ai", text: challengeAnswer(q, idea) },
      ]);
    } finally {
      setThinking(false);
    }
  }
  async function research() {
    setResearching(true);
    const d = await fetch(
      `/api/research?q=${encodeURIComponent(idea.title)}`,
    ).then((r) => r.json());
    setNews(d.items || []);
    setResearching(false);
  }
  return (
    <div
      className="panel-scrim"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <aside className="idea-panel">
        <header>
          <div>
            <span>{idea.status}</span>
            <h2>{idea.title}</h2>
            <p>{idea.content}</p>
          </div>
          <button onClick={close} aria-label="关闭">
            ×
          </button>
        </header>
        <nav>
          <button
            className={tab === "analysis" ? "active" : ""}
            onClick={() => setTab("analysis")}
          >
            结构化分析
          </button>
          <button
            className={tab === "talk" ? "active" : ""}
            onClick={() => setTab("talk")}
          >
            质疑与讨论
          </button>
          <button
            className={tab === "research" ? "active" : ""}
            onClick={() => setTab("research")}
          >
            最新进展
          </button>
        </nav>
        <div className="panel-body">
          {tab === "analysis" && (
            <>
              <section className="analysis-summary">
                <span>✦ 分析结论</span>
                <p>{idea.summary}</p>
              </section>
              <div className="score-grid">
                <Metric label="可实现性" value={idea.feasibility} />
                <Metric label="潜在价值" value={idea.impact} />
                <Metric label="表达清晰" value={idea.clarity} />
                <Metric label="综合信心" value={idea.confidence} />
              </div>
              <section className="risk-box">
                <small>关键风险 / 待验证假设</small>
                <p>{idea.risk}</p>
              </section>
              <section className="action-box">
                <small>推荐的下一步最小行动</small>
                <h3>{idea.nextAction}</h3>
                <div>
                  {["计划中", "行动中", "已完成", "已搁置"].map((s) => (
                    <button key={s} onClick={() => changeStatus(idea, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {tab === "talk" && (
            <>
              <div className="persona-row">
                <span>当前角色：严格但建设性的反方</span>
                <small>
                  {aiConfig.apiKey
                    ? "真实模型已连接"
                    : "自动使用站点模型；不可用时切换内置引擎"}
                </small>
              </div>
              <div className="chat">
                <div className="message ai">
                  <b>✦ 思考伙伴</b>
                  <p>
                    我想先挑战一点：{idea.risk}{" "}
                    你现在拥有的证据是什么，而不只是直觉？
                  </p>
                </div>
                {messages.map((m, i) => (
                  <div className={`message ${m.role}`} key={i}>
                    <b>{m.role === "you" ? "你" : "✦ 思考伙伴"}</b>
                    <p>{m.text}</p>
                  </div>
                ))}
                {thinking && (
                  <div className="message ai thinking">
                    <b>✦ 思考伙伴</b>
                    <p>
                      正在重新审视你的假设<span>•••</span>
                    </p>
                  </div>
                )}
              </div>
              <div className="chat-input">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask();
                    }
                  }}
                  placeholder="解释你的判断，或请它继续质疑……"
                />
                <button className="pressable" onClick={ask} disabled={thinking}>
                  发送 ↑
                </button>
              </div>
            </>
          )}
          {tab === "research" && (
            <>
              <section className="research-intro">
                <span>LIVE RESEARCH</span>
                <h3>看看这个方向最近发生了什么</h3>
                <p>
                  系统将从公开新闻中检索与该想法相关的最新信息。结果来自外部来源，请打开原文核实。
                </p>
                <button onClick={research} disabled={researching}>
                  {researching ? "正在检索…" : "获取最新进展"}
                </button>
              </section>
              {news.length > 0 && (
                <div className="news-list">
                  {news.map((n, i) => (
                    <a key={i} href={n.url} target="_blank" rel="noreferrer">
                      <small>
                        {n.source} ·{" "}
                        {n.date
                          ? new Date(n.date).toLocaleDateString("zh-CN")
                          : "近期"}
                      </small>
                      <h4>{n.title}</h4>
                      <span>查看原文 ↗</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
function AiSettings({
  config,
  serverAi,
  close,
  save,
}: {
  config: AiConfig;
  serverAi: boolean;
  close: () => void;
  save: (config: AiConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const defaults = {
    openai: "gpt-4.1-mini",
    deepseek: "deepseek-chat",
    openrouter: "openai/gpt-4.1-mini",
  };
  return (
    <div
      className="panel-scrim ai-scrim"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section className="ai-settings glass">
        <header>
          <div className="mini-logo">
            <i />
            <i />
            <i />
          </div>
          <div>
            <span>REAL MODEL CONNECTION</span>
            <h2>连接真实大模型</h2>
          </div>
          <button onClick={close} aria-label="关闭 AI 设置">
            ×
          </button>
        </header>
        <p>
          支持 OpenAI、DeepSeek 与 OpenRouter
          的兼容接口。密钥只保存在当前页面内存中，刷新或关闭页面后立即消失；也可以由站点管理员配置服务器密钥。
        </p>
        <label>
          服务商
          <select
            value={draft.provider}
            onChange={(event) => {
              const provider = event.target.value as AiConfig["provider"];
              setDraft((current) => ({
                ...current,
                provider,
                model: defaults[provider],
              }));
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          模型名称
          <input
            value={draft.model}
            onChange={(event) =>
              setDraft((current) => ({ ...current, model: event.target.value }))
            }
            placeholder="输入模型 ID"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
            placeholder={
              serverAi ? "服务器已配置，可留空" : "sk-…（不会被保存）"
            }
          />
        </label>
        <div className="security-note">
          <i />
          请求由本站后端转发，仅允许固定的官方服务地址，避免密钥暴露给第三方页面。
        </div>
        <footer>
          <button onClick={close}>取消</button>
          <button className="primary pressable" onClick={() => save(draft)}>
            保存连接
          </button>
        </footer>
      </section>
    </div>
  );
}
function challengeAnswer(q: string, idea: Idea) {
  const text = q.trim();
  if (/怎么|如何|下一步/.test(text))
    return `把范围再缩小：不要先“做出方案”，而是围绕「${idea.title}」找 3 位最可能的用户，只问他们最近一次遇到这个问题时做了什么。真实行为比态度更可靠。`;
  if (/可行|能不能|值得/.test(text))
    return `当前可实现性是 ${idea.feasibility}/100，但这不代表值得投入。最脆弱的地方是：${idea.risk} 我建议先用一次低于 2 小时的验证来购买更多确定性。`;
  if (/不同意|不是|但是/.test(text))
    return "这是一个有效反驳。现在请把它变成可验证陈述：什么事实出现时，你会承认自己的判断可能错了？如果没有失败条件，这个想法就还不能被真正检验。";
  return `我听到的核心判断是“${text.slice(0, 42)}${text.length > 42 ? "…" : ""}”。我会追问：这来自真实观察，还是你对用户的想象？请给出一个具体事件、一个真实的人，以及他们现在采用的替代方案。`;
}
