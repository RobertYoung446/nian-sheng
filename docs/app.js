const STORAGE_KEY = "niansheng-public-v1";
console.log("[念生] app.js 版本 20260827-3（讨论区模型直连版）");
const sampleIdeas = [
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
const titles = {
  today: "今天想推动什么？",
  inbox: "先收下，再慢慢想清楚",
  ideas: "你的想法，都在这里生长",
  network: "看见想法之间隐藏的连接",
  projects: "把值得做的事，一步步完成",
  review: "从行动里，看见自己的方向",
};
const providers = {
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4.1-mini",
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
};
let ideas = loadIdeas();
let currentView = "today";
let filter = "全部";
let selectedId = null;
let selectedTab = "analysis";
let chatMessages = [];
let ai = {
  provider: "openrouter",
  model: providers.openrouter.model,
  apiKey: "",
};
let toastTimer;
let oceanCleanup = null;
let lastFocusedNode = null;
let chatThinking = false;

const view = document.querySelector("#view");
const modalRoot = document.querySelector("#modalRoot");
document.querySelector("#dateLine").textContent = new Intl.DateTimeFormat(
  "zh-CN",
  { weekday: "long", month: "long", day: "numeric" },
).format(new Date());

function normalizeIdea(item) {
  if (!item || typeof item !== "object") return null;
  const merged = { ...item, ...sanitizeAnalysis(item) };
  merged.id =
    typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
  merged.status =
    typeof item.status === "string" && item.status.trim()
      ? item.status.trim()
      : "待验证";
  merged.createdAt = Number(item.createdAt) || Date.now();
  merged.updatedAt = Number(item.updatedAt) || merged.createdAt;
  return merged;
}
function loadIdeas() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeIdea).filter(Boolean);
  } catch {
    return [];
  }
}
function saveIdeas() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  updateChrome();
}
function shownIdeas() {
  return ideas.length ? ideas : sampleIdeas;
}
function esc(value = "") {
  return String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
function ago(time) {
  const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
  return days ? `${days} 天前` : "今天";
}
function metric(label, value) {
  return `<div class="metric"><span>${label}</span><div><i style="width:${Number(value) || 0}%"></i></div><strong>${Number(value) || 0}</strong></div>`;
}
function ideaCard(idea) {
  return `<button class="idea-card pressable" data-action="open-idea" data-id="${esc(idea.id)}"><div class="idea-meta"><span class="tag">${esc(idea.tags?.[0] || "想法")}</span><small>${ago(idea.updatedAt)}</small></div><h3>${esc(idea.title)}</h3><p>${esc(idea.summary)}</p>${metric("可实现性", idea.feasibility)}</button>`;
}
function updateChrome() {
  const count = ideas.length;
  const DAY = 86400000;
  const now = Date.now();
  const lastActive = (idea) =>
    idea.updatedAt || idea.createdAt || now;
  const weekCount = ideas.filter((item) => now - lastActive(item) <= 7 * DAY)
    .length;
  const activeDays = new Set(
    ideas.map((item) => new Date(lastActive(item)).toDateString()),
  );
  document.querySelector("#inboxCount").textContent = count;
  document.querySelector("#weekCount").innerHTML =
    `${weekCount} <span>个想法</span>`;
  document.querySelector("#streakBars").innerHTML = [6, 5, 4, 3, 2, 1, 0]
    .map((daysAgo) => {
      const date = new Date(now - daysAgo * DAY).toDateString();
      return `<i class="${activeDays.has(date) ? "lit" : ""}"></i>`;
    })
    .join("");
  document
    .querySelector("#aiButton")
    .classList.toggle("ready", Boolean(ai.apiKey));
}
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
}

function render(next = currentView) {
  currentView = next;
  document.querySelector("#pageTitle").textContent = titles[next];
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === next),
    );
  view.classList.remove("view-root");
  void view.offsetWidth;
  view.classList.add("view-root");
  if (next === "today") renderToday();
  if (next === "inbox") renderInbox();
  if (next === "ideas") renderLibrary();
  if (next === "network") renderNetwork();
  if (next === "projects") renderProjects();
  if (next === "review") renderReview();
  updateChrome();
}
function renderToday() {
  const list = shownIdeas(),
    focus =
      list.find((item) =>
        ["行动中", "待验证", "计划中"].includes(item.status),
      ) || list[0];
  view.innerHTML = `<div class="welcome"><span>✦</span><p>${ideas.length ? `你已经留下 ${ideas.length} 个真实想法。今天选择一个最小动作就好。` : "这是无需登录的公开独立版。先记录一个最近反复出现的念头。"}</p></div><section class="capture-card"><div class="capture-head"><span>✦</span><div><h2>捕捉刚刚闪过的念头</h2><p>不用整理，先把它留下来</p></div></div><textarea id="ideaDraft" placeholder="我刚想到……" aria-label="记录新想法"></textarea><div class="capture-footer"><span>数据保存在当前浏览器；连接模型后会自动深入分析</span><button class="primary pressable" data-action="save-idea">收进灵感箱</button></div></section><div class="section-heading"><div><h2>此刻最值得推进</h2><p>根据可行性、影响力与状态整理</p></div><button data-action="open-idea" data-id="${esc(focus.id)}">查看完整分析 →</button></div><section class="focus-card"><div class="focus-main"><div class="eyebrow"><span>本周焦点</span><small>${esc(focus.status)}</small></div><h2>${esc(focus.title)}</h2><p>${esc(focus.summary)}</p>${metric("想法成熟度", focus.confidence)}<div class="next-action"><span>下一步最小行动</span><p>${esc(focus.nextAction)}</p><button class="pressable" data-action="open-idea" data-id="${esc(focus.id)}">开始行动 →</button></div></div><aside class="ai-note"><span>✦</span><small>思考伙伴的提醒</small><h3>别急着证明它是对的</h3><p>${esc(focus.risk)}</p><button class="pressable" data-action="open-idea" data-id="${esc(focus.id)}">展开质疑</button></aside></section><div class="section-heading"><div><h2>最近的想法</h2><p>${list.length} 个方向正在等待选择</p></div></div><section class="idea-grid">${list.slice(0, 3).map(ideaCard).join("")}</section>`;
}
function renderInbox() {
  const list = shownIdeas();
  view.innerHTML = `<section class="surface"><div class="surface-head"><div><h2>${list.length} 个想法等待整理</h2><p>先看分析，再决定验证、推进还是搁置。</p></div><div class="big-number">${list.length}</div></div><div class="idea-list">${list.map((idea) => `<article><button class="idea-row pressable" data-action="open-idea" data-id="${esc(idea.id)}"><h3>${esc(idea.title)}</h3><p>${esc(idea.summary)}</p></button><div class="row-actions"><span>${esc(idea.tags.join(" · "))}</span><button data-action="status" data-id="${esc(idea.id)}" data-status="待验证">去验证</button><button data-action="status" data-id="${esc(idea.id)}" data-status="已搁置">搁置</button></div></article>`).join("")}</div></section>`;
}
function renderLibrary() {
  const list = shownIdeas();
  const statuses = ["全部", "待验证", "计划中", "行动中", "已完成", "已搁置"];
  const filtered =
    filter === "全部" ? list : list.filter((item) => item.status === filter);
  view.innerHTML = `<div class="filters">${statuses.map((status) => `<button class="pressable ${filter === status ? "active" : ""}" data-action="filter" data-filter="${status}">${status}</button>`).join("")}</div><section class="idea-grid">${filtered.length ? filtered.map(ideaCard).join("") : '<div class="empty">这个阶段还没有想法。<br>这也意味着你可以更专注。</div>'}</section>`;
}
function renderNetwork() {
  const list = shownIdeas();
  view.innerHTML = `<section class="graph-stage glass"><div class="graph-copy"><span class="tag">AI IDEA OCEAN</span><h2>想法会像海面上的岛屿<br>自己找到彼此</h2><p>连接真实大模型后，它会判断相似、依赖、先后、包含、互补与冲突关系，并自主编排关系网络。</p><button class="open-ocean pressable" data-action="open-ocean">进入全屏关系海 ↗</button></div><button class="ocean-preview pressable" data-action="open-ocean" aria-label="打开全屏想法关系图谱"><div class="preview-water"><i></i><i></i><i></i></div>${list
    .slice(0, 5)
    .map(
      (idea) =>
        `<span class="preview-node">${esc(idea.tags[0] || "想法")}<b>${esc(idea.title)}</b></span>`,
    )
    .join(
      "",
    )}</button><div class="graph-insight"><strong>✦ AI 关系引擎</strong>将分析 ${list.length} 个想法，不再只依赖相同标签。按住全屏海面即可自由拖动观察。</div></section>`;
}
function renderProjects() {
  const list = shownIdeas().filter((item) =>
    ["待验证", "计划中", "行动中"].includes(item.status),
  );
  view.innerHTML = `<div class="section-heading"><div><h2>每个项目，只突出下一步</h2><p>${list.length} 个方向正在推进</p></div></div><section class="kanban">${[
    "待验证",
    "计划中",
    "行动中",
  ]
    .map(
      (status) =>
        `<div class="kanban-column"><header><span>${status}</span><b>${list.filter((item) => item.status === status).length}</b></header>${list
          .filter((item) => item.status === status)
          .map(
            (idea) =>
              `<article class="task-card"><button data-action="open-idea" data-id="${esc(idea.id)}"><small>${esc(idea.tags[0] || "想法")}</small><h3>${esc(idea.title)}</h3><p>下一步：${esc(idea.nextAction)}</p></button>${metric("成熟度", idea.confidence)}<select data-action="status-select" data-id="${esc(idea.id)}" aria-label="更改状态"><option ${idea.status === "待验证" ? "selected" : ""}>待验证</option><option ${idea.status === "计划中" ? "selected" : ""}>计划中</option><option ${idea.status === "行动中" ? "selected" : ""}>行动中</option><option>已完成</option></select></article>`,
          )
          .join("")}</div>`,
    )
    .join("")}</section>`;
}
function renderReview() {
  const list = shownIdeas();
  const safeScore = (value) =>
    Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const average = (key) =>
    list.length
      ? Math.round(
          list.reduce((sum, item) => sum + safeScore(item[key]), 0) /
            list.length,
        )
      : 0;
  const clarity = average("clarity");
  const now = Date.now();
  const weekNew = list.filter(
    (item) => now - (item.createdAt || item.updatedAt || now) <= 604800000,
  ).length;
  view.innerHTML = `<section class="review-hero glass"><div><span class="tag">WEEKLY REVIEW</span><h2>你不需要做完所有想法<br>只需要看清真正重要的。</h2><p>这是根据当前浏览器里的记录生成的复盘。</p></div><div class="review-ring" style="--score:${(clarity * 3.6).toFixed(1)}deg"><strong>${clarity}</strong><small>方向清晰度</small></div></section><div class="review-stats">${[
    ["本周新增", weekNew, "个真实想法"],
    ["正在推进", list.filter((i) => i.status === "行动中").length, "保持聚焦"],
    ["已经完成", list.filter((i) => i.status === "已完成").length, "值得庆祝"],
    ["平均可行性", average("feasibility"), "综合评分"],
  ]
    .map(
      (row) =>
        `<article class="review-card"><small>${row[0]}</small><strong>${row[1]}</strong><p>${row[2]}</p></article>`,
    )
    .join(
      "",
    )}</div><div class="review-grid"><article class="review-card"><span>✦ 本周观察</span><h3>${ideas.length ? "你开始把模糊念头变成可讨论的对象。" : "第一条真实记录就是最重要的开始。"}</h3><p>${ideas.length ? "下一周不要增加更多项目，先完成一个最低成本验证。" : "记录一个你最近三次想到的问题。不必完整，只要真实。"}</p></article><article class="review-card"><span>下周建议</span><ol><li>只选择一个想法进入行动中</li><li>安排一次不超过 30 分钟的真实验证</li><li>周日回来记录：我学到了什么？</li></ol></article></div>`;
}

async function saveDraft() {
  const node = document.querySelector("#ideaDraft");
  const content = node?.value.trim();
  if (!content) {
    toast("先写下一点什么吧");
    return;
  }
  const basic = heuristic(content);
  const idea = {
    id: crypto.randomUUID(),
    content,
    status: "待验证",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...basic,
  };
  ideas.unshift(idea);
  saveIdeas();
  node.value = "";
  toast("已保存到当前浏览器");
  if (ai.apiKey) {
    toast("已保存，真实模型正在分析");
    try {
      const analysis = await analyzeWithModel(content);
      Object.assign(idea, analysis, { updatedAt: Date.now() });
      saveIdeas();
      toast("真实大模型分析完成");
    } catch (error) {
      toast(error.message || "模型连接失败，已保留本地分析");
    }
  }
  render("today");
}
function heuristic(content) {
  const clean = content.replace(/\s+/g, " ").trim();
  const audience = /(用户|人群|创作者|学生|团队|企业|客户)/.test(clean),
    action = /(制作|开发|建立|设计|帮助|解决|记录|验证|实现)/.test(clean),
    outcome = /(提高|减少|更快|价值|效率|成长|落地)/.test(clean);
  const clarity = Math.min(
    92,
    42 +
      Math.min(18, Math.floor(clean.length / 8)) +
      (audience ? 14 : 0) +
      (action ? 12 : 0),
  );
  const feasibility = Math.min(
    90,
    50 + (action ? 13 : 0) + (clean.length > 24 ? 10 : 0),
  );
  const impact = Math.min(92, 48 + (outcome ? 18 : 0) + (audience ? 10 : 0));
  const tags = [
    /(产品|工具|软件|网站|应用|平台)/.test(clean) ? "产品" : null,
    /(内容|写作|视频|播客|声音|创作)/.test(clean) ? "内容" : null,
    /(学习|知识|课程|教育)/.test(clean) ? "学习" : null,
    /(生活|习惯|健康|每周|每天)/.test(clean) ? "生活" : null,
  ].filter(Boolean);
  if (!tags.length) tags.push("新想法");
  const missing = !audience
    ? "目标用户仍不够明确"
    : !outcome
      ? "预期价值还缺少可衡量的结果"
      : "用户是否愿意改变现有行为尚未验证";
  return {
    title: clean.length > 32 ? `${clean.slice(0, 30)}…` : clean,
    summary: `当前最值得补充的是：${missing}。`,
    tags,
    feasibility,
    impact,
    clarity,
    confidence: Math.round((clarity + feasibility + impact) / 3) - 5,
    risk: `${missing}。如果假设不成立，继续投入会增加沉没成本。`,
    nextAction: !audience
      ? "写出最可能需要它的一类人，并找 1 位真实对象聊 15 分钟。"
      : "找 3 位目标用户，用同一个问题验证他们是否真的存在这项需求。",
  };
}

async function callModel(messages, temperature = 0.55) {
  if (!ai.apiKey) throw new Error("请先连接真实大模型");
  const config = providers[ai.provider];
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      "Content-Type": "application/json",
      ...(ai.provider === "openrouter" ? { "X-Title": "念生" } : {}),
    },
    body: JSON.stringify({
      model: ai.model || config.model,
      messages,
      temperature,
      max_tokens: 1600,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "模型服务返回错误");
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("模型没有返回内容");
  return content;
}
function parseJson(text) {
  const clean = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = Math.min(
        ...[clean.indexOf("{"), clean.indexOf("[")].filter((i) => i >= 0),
      ),
      end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
    return JSON.parse(clean.slice(start, end + 1));
  }
}
function sanitizeAnalysis(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const text = (value, fallback) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const score = (value) =>
    Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const tags = Array.isArray(data.tags)
    ? data.tags
        .filter((tag) => typeof tag === "string" && tag.trim())
        .map((tag) => tag.trim().slice(0, 12))
        .slice(0, 6)
    : [];
  return {
    title: text(data.title, "未命名想法").slice(0, 60),
    summary: text(data.summary, ""),
    tags: tags.length ? tags : ["想法"],
    feasibility: score(data.feasibility),
    impact: score(data.impact),
    clarity: score(data.clarity),
    confidence: score(data.confidence),
    risk: text(data.risk, "暂待评估"),
    nextAction: text(data.nextAction, "先定义一个最小的验证动作。"),
  };
}
async function analyzeWithModel(content) {
  const reply = await callModel(
    [
      {
        role: "system",
        content:
          "你是严格务实的创新评审。只返回有效JSON，字段：title,summary,tags数组,feasibility,impact,clarity,confidence(0-100整数),risk,nextAction。不要迎合，结论具体可验证。",
      },
      { role: "user", content: `分析这个想法：\n${content}` },
    ],
    0.35,
  );
  return sanitizeAnalysis(parseJson(reply));
}
async function analyzeRelations(list) {
  if (!ai.apiKey) return fallbackEdges(list);
  const compact = list
    .slice(0, 35)
    .map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags,
    }));
  const reply = await callModel(
    [
      {
        role: "system",
        content:
          '分析想法的语义和逻辑关系。只返回JSON：{"edges":[{"sourceId":"","targetId":"","type":"相似|依赖|先后|包含|互补|冲突|资源复用","reason":"20字内原因","strength":0到1}]}。只能使用提供的ID，每个想法最多3条边。',
      },
      { role: "user", content: JSON.stringify(compact) },
    ],
    0.2,
  );
  return parseJson(reply).edges || [];
}
function fallbackEdges(list) {
  const edges = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const shared = list[i].tags.filter((tag) => list[j].tags.includes(tag));
      if (shared.length)
        edges.push({
          sourceId: list[i].id,
          targetId: list[j].id,
          type: "主题相似",
          reason: `共享${shared.join("、")}`,
          strength: 0.68,
        });
    }
  if (!edges.length && list.length > 1)
    for (let i = 1; i < list.length; i++)
      edges.push({
        sourceId: list[0].id,
        targetId: list[i].id,
        type: "潜在互补",
        reason: "等待模型判断",
        strength: 0.4,
      });
  return edges;
}

function openIdea(id) {
  const idea = shownIdeas().find((item) => item.id === id);
  if (!idea) return;
  selectedId = id;
  selectedTab = "analysis";
  chatMessages = [];
  chatThinking = false;
  renderIdeaSheet(idea);
}
function rememberFocus() {
  if (!modalRoot.childElementCount) lastFocusedNode = document.activeElement;
}
function restoreFocus() {
  if (lastFocusedNode?.isConnected) lastFocusedNode.focus();
  lastFocusedNode = null;
}
function renderIdeaSheet(idea) {
  if (!idea) return;
  const fresh = !modalRoot.childElementCount;
  if (fresh) lastFocusedNode = document.activeElement;
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="sheet glass"><header><div><span>${esc(idea.status)}</span><h2>${esc(idea.title)}</h2><p>${esc(idea.content)}</p></div><button class="close pressable" data-action="close-modal">×</button></header><div class="tabs"><button class="${selectedTab === "analysis" ? "active" : ""}" data-action="idea-tab" data-tab="analysis">结构化分析</button><button class="${selectedTab === "talk" ? "active" : ""}" data-action="idea-tab" data-tab="talk">质疑与讨论</button><button class="${selectedTab === "research" ? "active" : ""}" data-action="idea-tab" data-tab="research">最新进展</button></div><div class="sheet-body">${ideaTabContent(idea)}</div></section></div>`;
  if (fresh) modalRoot.querySelector(".close")?.focus();
}
function ideaTabContent(idea) {
  if (selectedTab === "analysis")
    return `<section class="analysis-summary"><span>✦ 分析结论</span><p>${esc(idea.summary)}</p></section><div class="score-grid">${metric("可实现性", idea.feasibility)}${metric("潜在价值", idea.impact)}${metric("表达清晰", idea.clarity)}${metric("综合信心", idea.confidence)}</div><section class="risk-box"><small>关键风险 / 待验证假设</small><p>${esc(idea.risk)}</p></section><section class="action-box"><small>推荐的下一步最小行动</small><h3>${esc(idea.nextAction)}</h3><div class="action-actions">${["计划中", "行动中", "已完成", "已搁置"].map((status) => `<button data-action="status" data-id="${esc(idea.id)}" data-status="${status}">${status}</button>`).join("")}</div></section>`;
  if (selectedTab === "talk") {
    const lead = ai.apiKey
      ? ""
      : `<div class="message"><b>✦ 思考伙伴</b><p>我先挑战一点：${esc(idea.risk)} 你拥有的证据是什么，而不只是直觉？</p></div>`;
    const thinking = chatThinking
      ? `<div class="message thinking"><b>✦ 思考伙伴</b><p>正在结合你的想法组织质疑……</p></div>`
      : "";
    return `<div class="chat" id="chatLog">${lead}${chatMessages.map((message) => `<div class="message ${message.role}"><b>${message.role === "you" ? "你" : "✦ 思考伙伴"}</b><p>${esc(message.text)}</p></div>`).join("")}${thinking}</div><div class="chat-input"><textarea id="chatQuestion" placeholder="解释你的判断，或请它继续质疑……（Enter 发送，Shift+Enter 换行）"></textarea><button class="primary pressable" data-action="send-chat" ${chatThinking ? "disabled" : ""}>发送 ↑</button></div>`;
  }
  return `<section class="analysis-summary"><span>LIVE RESEARCH</span><p>浏览器公开版会打开 Bing News 检索该想法的最新公开进展，结果请以原始来源为准。</p></section><div style="margin-top:16px"><button class="primary pressable" data-action="research" data-title="${esc(idea.title)}">检索最新进展 ↗</button></div>`;
}
function closeModal() {
  modalRoot.innerHTML = "";
  selectedId = null;
  restoreFocus();
}
function sheetStillOpen() {
  return Boolean(modalRoot.querySelector(".sheet"));
}
function scrollChatToBottom() {
  const log = document.querySelector("#chatLog");
  const sheet = modalRoot.querySelector(".sheet");
  if (log) log.scrollTop = log.scrollHeight;
  if (sheet) sheet.scrollTop = sheet.scrollHeight;
}
function chatSystemPrompt(idea) {
  return [
    "你是严格、犀利但建设性的思想伙伴，任务是帮用户压力测试他们的想法。",
    "要求：",
    "1. 针对用户的具体表述回应，可以引用他们之前的原话进行追问，禁止重复已经用过的问法；",
    "2. 每次只聚焦一个最要害的问题，追问证据、事实和数字，而不是泛泛的方法论；",
    "3. 主动指出隐含假设、可能的反例，并给出最低成本的验证路径；",
    "4. 用中文，简洁直接，单次回复不超过150字；不迎合，不空洞鼓励。",
    `当前想法背景——标题：${idea.title}；描述：${idea.content}；摘要：${idea.summary}；关键风险：${idea.risk}；状态：${idea.status}。`,
  ].join("\n");
}
function chatMessagesPayload(idea) {
  return [
    { role: "system", content: chatSystemPrompt(idea) },
    ...chatMessages.map((message) => ({
      role: message.role === "you" ? "user" : "assistant",
      content: message.text,
    })),
  ];
}
async function generateOpener(idea) {
  chatThinking = true;
  renderIdeaSheet(idea);
  try {
    const reply = await callModel(
      chatMessagesPayload(
        idea,
      ).concat([
        {
          role: "user",
          content:
            "请发起你的第一条质疑：针对这个想法最要害的假设，提出一个我必须正面回答的问题。",
        },
      ]),
      0.7,
    );
    chatMessages.push({ role: "ai", text: reply });
  } catch (error) {
    chatMessages.push({ role: "ai", text: `模型连接失败：${error.message}` });
  }
  chatThinking = false;
  if (sheetStillOpen()) {
    renderIdeaSheet(idea);
    scrollChatToBottom();
  }
}
async function sendChat() {
  if (chatThinking) return;
  const input = document.querySelector("#chatQuestion"),
    question = input?.value.trim();
  if (!question) return;
  const idea = shownIdeas().find((item) => item.id === selectedId);
  if (!idea) return;
  chatMessages.push({ role: "you", text: question });
  if (!ai.apiKey) {
    chatMessages.push({ role: "ai", text: challengeAnswer(question, idea) });
    renderIdeaSheet(idea);
    scrollChatToBottom();
    return;
  }
  chatThinking = true;
  renderIdeaSheet(idea);
  scrollChatToBottom();
  try {
    const reply = await callModel(chatMessagesPayload(idea), 0.65);
    chatMessages.push({ role: "ai", text: reply });
  } catch (error) {
    chatMessages.push({ role: "ai", text: `模型连接失败：${error.message}` });
  }
  chatThinking = false;
  if (sheetStillOpen()) {
    renderIdeaSheet(idea);
    scrollChatToBottom();
  }
}
function challengeAnswer(question, idea) {
  if (/怎么|如何|下一步/.test(question))
    return `不要先做完整方案。围绕「${idea.title}」找 3 位最可能的用户，只问他们最近一次遇到问题时做了什么。`;
  return `请把“${question.slice(0, 40)}”变成可证伪的陈述：什么事实出现时，你会承认自己的判断可能错了？`;
}

function showAiSettings() {
  rememberFocus();
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="settings glass"><header><div class="mini-logo"><i></i><i></i><i></i></div><div><span>REAL MODEL CONNECTION</span><h2>连接真实大模型</h2></div><button class="close pressable" data-action="close-modal">×</button></header><p>GitHub Pages 没有服务器。密钥只保留在当前页面内存，并由浏览器直接发给所选模型服务；刷新或关闭页面后立即消失。推荐使用支持浏览器请求的 OpenRouter。</p><label>服务商<select id="provider"><option value="openrouter" ${ai.provider === "openrouter" ? "selected" : ""}>OpenRouter（推荐）</option><option value="openai" ${ai.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="deepseek" ${ai.provider === "deepseek" ? "selected" : ""}>DeepSeek</option></select></label><label>模型名称<input id="model" value="${esc(ai.model)}"></label><label>API Key<input id="apiKey" type="password" autocomplete="off" value="${esc(ai.apiKey)}" placeholder="仅保留到页面关闭"></label><div class="security">公开静态版不会保存或上传密钥到本站；请求会直接发送至你选择的官方模型地址。请使用可撤销、有限额的个人密钥。</div><footer><button data-action="close-modal">取消</button><button class="primary pressable" data-action="save-ai">保存连接</button></footer></section></div>`;
  modalRoot.querySelector(".close")?.focus();
}
function saveAi() {
  const provider = document.querySelector("#provider").value;
  ai = {
    provider,
    model:
      document.querySelector("#model").value.trim() ||
      providers[provider].model,
    apiKey: document.querySelector("#apiKey").value.trim(),
  };
  closeModal();
  updateChrome();
  toast(
    ai.apiKey ? "真实大模型已连接；密钥不会持久化" : "已切换为本地分析引擎",
  );
}

async function openOcean() {
  if (document.querySelector("#ocean")) return;
  const list = shownIdeas();
  modalRoot.innerHTML = `<section class="ocean" id="ocean"><canvas></canvas><div class="ocean-grain"></div><header class="ocean-toolbar glass"><div><span>AI IDEA OCEAN</span><h2>想法关系海</h2><p>按住并拖动海面探索 · 点击想法查看详情</p></div><div class="engine-state"><i></i><b>${ai.apiKey ? "AI 正在分析关系…" : "本地语义引擎模式"}</b></div><button class="close pressable" data-action="close-ocean">×</button></header><div class="ocean-world"></div><div class="drag-hint">按住海面拖动 ↔</div></section>`;
  const ocean = document.querySelector("#ocean"),
    world = ocean.querySelector(".ocean-world"),
    canvas = ocean.querySelector("canvas"),
    ctx = canvas.getContext("2d");
  if (!modalRoot.childElementCount) lastFocusedNode = document.activeElement;
  let points = layoutPoints(list);
  world.innerHTML = points
    .map((point, index) => {
      const idea = list.find((item) => item.id === point.id);
      return `<button class="ocean-node pressable" data-action="ocean-idea" data-id="${esc(idea.id)}" style="left:${point.x}px;top:${point.y}px;animation-delay:-${index * 1.3}s"><span>${esc(idea.tags[0] || "想法")}</span><h3>${esc(idea.title)}</h3><div><small>${esc(idea.status)}</small><b>${idea.confidence}</b></div></button>`;
    })
    .join("");
  let edges = fallbackEdges(list),
    pan = { x: 0, y: 0 },
    drag = null,
    pointer = { x: innerWidth / 2, y: innerHeight / 2 },
    frame;
  const nodes = world.querySelectorAll(".ocean-node");
  const relayout = () => {
    points = layoutPoints(list);
    points.forEach((point, index) => {
      const node = nodes[index];
      if (node) {
        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
      }
    });
  };
  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    relayout();
  };
  const down = (event) => {
    if (
      event.target.closest(".ocean-node") ||
      event.target.closest(".ocean-toolbar")
    )
      return;
    ocean.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, ox: pan.x, oy: pan.y };
  };
  const move = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!drag) return;
    pan = {
      x: drag.ox + event.clientX - drag.x,
      y: drag.oy + event.clientY - drag.y,
    };
    world.style.transform = `translate3d(${pan.x}px,${pan.y}px,0)`;
  };
  const up = () => (drag = null);
  const start = performance.now();
  const draw = (now) => {
    drawOcean(ctx, innerWidth, innerHeight, (now - start) / 1000, pointer);
    drawEdges(ctx, points, edges, pan, (now - start) / 1000);
    frame = requestAnimationFrame(draw);
  };
  resize();
  addEventListener("resize", resize);
  ocean.addEventListener("pointerdown", down);
  ocean.addEventListener("pointermove", move);
  ocean.addEventListener("pointerup", up);
  frame = requestAnimationFrame(draw);
  ocean.querySelector(".close")?.focus();
  oceanCleanup = () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
  };
  try {
    edges = await analyzeRelations(list);
    const status = ocean.querySelector(".engine-state");
    if (ai.apiKey) status.classList.add("model");
    status.querySelector("b").textContent = ai.apiKey
      ? "真实大模型已完成关系分配"
      : "本地语义引擎模式";
  } catch (error) {
    toast(error.message || "关系分析失败，已使用本地引擎");
  }
}
function closeOcean() {
  oceanCleanup?.();
  oceanCleanup = null;
  modalRoot.innerHTML = "";
  restoreFocus();
}
function layoutPoints(list) {
  const w = Math.max(innerWidth, 1000),
    h = Math.max(innerHeight, 700);
  return list.map((item, index) => {
    const ring = Math.floor(index / 8),
      slot = index % 8,
      angle = (slot / Math.min(8, list.length)) * Math.PI * 2 + ring * 0.45,
      radius = 250 + ring * 250;
    return {
      id: item.id,
      x: w / 2 + Math.cos(angle) * radius,
      y: h / 2 + Math.sin(angle) * radius,
    };
  });
}
function drawOcean(ctx, w, h, t, pointer) {
  ctx.clearRect(0, 0, w, h);
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#dff3eb");
  base.addColorStop(0.48, "#b8dccd");
  base.addColorStop(1, "#6ea992");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "screen";
  [
    [0.18, 0.2, 260, "rgba(255,255,255,.55)"],
    [0.76, 0.24, 330, "rgba(180,230,211,.42)"],
    [pointer.x / w || 0.5, pointer.y / h || 0.5, 220, "rgba(255,240,218,.32)"],
  ].forEach(([bx, by, r, color], i) => {
    const x = bx * w + Math.sin(t * 0.22 + i) * 60,
      y = by * h + Math.cos(t * 0.18 + i) * 45,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    for (let x = -40; x < w + 40; x += 18) {
      const y =
        h * (0.12 + i * 0.11) +
        Math.sin(x * 0.008 + t * 0.35 + i) * 22 +
        Math.sin(x * 0.003 - t * 0.2) * 18;
      x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.09 + i * 0.008})`;
    ctx.stroke();
  }
}
function drawEdges(ctx, points, edges, pan, t) {
  const map = new Map(points.map((point) => [point.id, point]));
  edges.forEach((edge, index) => {
    const a = map.get(edge.sourceId),
      b = map.get(edge.targetId);
    if (!a || !b) return;
    const ax = a.x + pan.x,
      ay = a.y + pan.y,
      bx = b.x + pan.x,
      by = b.y + pan.y,
      mx = (ax + bx) / 2 + Math.sin(t * 0.45 + index) * 18,
      my = (ay + by) / 2 + Math.cos(t * 0.38 + index) * 18;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.strokeStyle = `rgba(28,91,67,${0.22 + (edge.strength || 0.5) * 0.34})`;
    ctx.lineWidth = 1 + (edge.strength || 0.5) * 2;
    ctx.stroke();
    ctx.setLineDash([2, 10]);
    ctx.lineDashOffset = -t * 8;
    ctx.strokeStyle = "rgba(255,255,255,.52)";
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-view],[data-action]");
  if (!target) return;
  if (target.dataset.view) {
    render(target.dataset.view);
    return;
  }
  const action = target.dataset.action;
  if (action === "focus-capture") {
    render("today");
    setTimeout(() => document.querySelector("#ideaDraft")?.focus(), 0);
  }
  if (action === "save-idea") saveDraft();
  if (action === "open-idea") openIdea(target.dataset.id);
  if (action === "close-modal") {
    const bubbledFromContent =
      target.classList.contains("scrim") && event.target !== target;
    if (!bubbledFromContent) closeModal();
  }
  if (action === "filter") {
    filter = target.dataset.filter;
    renderLibrary();
  }
  if (action === "status") {
    changeStatus(target.dataset.id, target.dataset.status);
    closeModal();
    render(currentView);
  }
  if (action === "idea-tab") {
    selectedTab = target.dataset.tab;
    const idea = shownIdeas().find((item) => item.id === selectedId);
    renderIdeaSheet(idea);
    if (
      selectedTab === "talk" &&
      idea &&
      ai.apiKey &&
      !chatMessages.length &&
      !chatThinking
    )
      generateOpener(idea);
  }
  if (action === "send-chat") sendChat();
  if (action === "research")
    window.open(
      `https://www.bing.com/news/search?q=${encodeURIComponent(target.dataset.title)}`,
      "_blank",
      "noopener",
    );
  if (action === "save-ai") saveAi();
  if (action === "open-ocean") openOcean();
  if (action === "close-ocean") closeOcean();
  if (action === "ocean-idea") {
    closeOcean();
    openIdea(target.dataset.id);
  }
});
document.addEventListener("change", (event) => {
  if (event.target.matches('[data-action="status-select"]'))
    changeStatus(event.target.dataset.id, event.target.value);
  if (event.target.id === "provider")
    document.querySelector("#model").value =
      providers[event.target.value].model;
});
document.addEventListener("keydown", (event) => {
  if (event.target?.id === "chatQuestion" && event.key === "Enter") {
    if (!event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
    return;
  }
  if (event.key !== "Escape") return;
  if (document.querySelector("#ocean")) {
    closeOcean();
    return;
  }
  if (modalRoot.querySelector(".scrim")) closeModal();
});
document.querySelector("#aiButton").addEventListener("click", showAiSettings);
function changeStatus(id, status) {
  const idea = ideas.find((item) => item.id === id);
  if (!idea) {
    toast("这是体验示例，记录自己的想法后即可推进");
    return;
  }
  idea.status = status;
  idea.updatedAt = Date.now();
  saveIdeas();
  toast(`已进入「${status}」`);
}

updateChrome();
render("today");
