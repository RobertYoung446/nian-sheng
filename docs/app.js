const STORAGE_KEY = "niansheng-public-v1";
const STORAGE_BACKUP = "niansheng-public-backup-v1";
const AI_STORAGE_KEY = "niansheng-ai-config-v1";
console.log("[念生] app.js 版本 20260827-12（想法编辑与演变历程）");
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
let toastTimer;
let oceanCleanup = null;
let lastFocusedNode = null;
let chatThinking = false;
let cardClickTimer = null;
let editingIdea = false;
let reanalyzing = false;
let ideas = loadIdeas();
let currentView = "today";
let filter = "全部";
let selectedId = null;
let selectedTab = "analysis";
let chatMessages = [];
let ai = { provider: "openrouter", model: providers.openrouter.model, apiKey: "" };
try {
  const savedAi = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || "null");
  if (savedAi && typeof savedAi === "object" && typeof savedAi.apiKey === "string" && savedAi.apiKey) {
    const provider = providers[savedAi.provider] ? savedAi.provider : "openrouter";
    ai = {
      provider,
      model:
        typeof savedAi.model === "string" && savedAi.model.trim()
          ? savedAi.model.trim()
          : providers[provider].model,
      apiKey: savedAi.apiKey,
    };
  }
} catch {}
let research = {
  ideaId: null,
  query: "",
  usedQueries: [],
  loading: false,
  error: null,
  items: [],
  activeTag: null,
  summary: "",
  summarizing: false,
};

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizeIdea).filter(Boolean);
    }
  } catch {}
  try {
    const rawBackup = localStorage.getItem(STORAGE_BACKUP);
    if (rawBackup) {
      const backup = JSON.parse(rawBackup);
      if (Array.isArray(backup) && backup.length) {
        toast("检测到主数据异常，已从本地备份恢复");
        return backup.map(normalizeIdea).filter(Boolean);
      }
    }
  } catch {}
  return [];
}
function saveIdeas() {
  const json = JSON.stringify(ideas);
  localStorage.setItem(STORAGE_KEY, json);
  try {
    localStorage.setItem(STORAGE_BACKUP, json);
  } catch {}
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
  view.innerHTML = `<div class="welcome"><span>✦</span><p>${ideas.length ? `你已经留下 ${ideas.length} 个真实想法。今天选择一个最小动作就好。` : "这是无需登录的公开独立版。先记录一个最近反复出现的念头。"}</p></div><section class="capture-card"><div class="capture-head"><span>✦</span><div><h2>捕捉刚刚闪过的念头</h2><p>不用整理，先把它留下来</p></div></div><textarea id="ideaDraft" placeholder="我刚想到……" aria-label="记录新想法"></textarea><div class="capture-footer"><span>数据保存在当前浏览器 · <button class="data-entry" data-action="open-data">备份 / 导入</button></span><button class="primary pressable" data-action="save-idea">收进灵感箱</button></div></section><div class="section-heading"><div><h2>此刻最值得推进</h2><p>根据可行性、影响力与状态整理</p></div><button data-action="open-idea" data-id="${esc(focus.id)}">查看完整分析 →</button></div><section class="focus-card"><div class="focus-main"><div class="eyebrow"><span>本周焦点</span><small>${esc(focus.status)}</small></div><h2>${esc(focus.title)}</h2><p>${esc(focus.summary)}</p>${metric("想法成熟度", focus.confidence)}<div class="next-action"><span>下一步最小行动</span><p>${esc(focus.nextAction)}</p><button class="pressable" data-action="open-idea" data-id="${esc(focus.id)}">开始行动 →</button></div></div><aside class="ai-note"><span>✦</span><small>思考伙伴的提醒</small><h3>别急着证明它是对的</h3><p>${esc(focus.risk)}</p><button class="pressable" data-action="open-idea" data-id="${esc(focus.id)}" data-tab="talk">展开质疑</button></aside></section><div class="section-heading"><div><h2>最近的想法</h2><p>${list.length} 个方向正在等待选择</p></div></div><section class="idea-grid">${list.slice(0, 3).map(ideaCard).join("")}</section>`;
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

function openIdea(id, tab = "analysis") {
  const idea = shownIdeas().find((item) => item.id === id);
  if (!idea) return;
  selectedId = id;
  selectedTab = tab;
  chatMessages = [];
  chatThinking = false;
  editingIdea = false;
  if (research.ideaId !== id)
    research = {
      ideaId: id,
      query: idea.title || "",
      usedQueries: [],
      loading: false,
      error: null,
      items: [],
      activeTag: null,
      summary: "",
      summarizing: false,
    };
  renderIdeaSheet(idea);
  if (tab === "talk" && ai.apiKey && !chatThinking) generateOpener(idea);
}
function rememberFocus() {
  if (!modalRoot.childElementCount) lastFocusedNode = document.activeElement;
}
function restoreFocus() {
  if (lastFocusedNode?.isConnected) lastFocusedNode.focus();
  lastFocusedNode = null;
}
function editFormHTML(idea) {
  return `<div class="edit-form"><label>标题<input id="editTitle" value="${esc(idea.title)}"></label><label>描述<textarea id="editContent">${esc(idea.content)}</textarea></label><label>修改原因（必填）<textarea id="editReason" placeholder="为什么修改？比如：和用户聊完发现他们在意的其实是预览效果…"></textarea></label><label>对应目标（选填）<input id="editGoal" placeholder="这次修改服务于什么目标？"></label><div class="edit-row"><button class="primary pressable" data-action="save-edit">保存修改</button><button data-action="cancel-edit">取消</button></div></div>`;
}
function renderIdeaSheet(idea) {
  if (!idea) return;
  const fresh = !modalRoot.childElementCount;
  if (fresh) lastFocusedNode = document.activeElement;
  const body = editingIdea ? editFormHTML(idea) : ideaTabContent(idea);
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="sheet glass"><header><div><span>${esc(idea.status)}${Array.isArray(idea.history) && idea.history.length ? ` · 已演变 ${idea.history.length} 次` : ""}</span><h2>${esc(idea.title)}</h2><p>${esc(idea.content)}</p></div><button class="close pressable" data-action="close-modal">×</button></header><div class="tabs"><button class="${selectedTab === "analysis" ? "active" : ""}" data-action="idea-tab" data-tab="analysis">结构化分析</button><button class="${selectedTab === "talk" ? "active" : ""}" data-action="idea-tab" data-tab="talk">质疑与讨论</button><button class="${selectedTab === "research" ? "active" : ""}" data-action="idea-tab" data-tab="research">最新进展</button><button class="${selectedTab === "history" ? "active" : ""}" data-action="idea-tab" data-tab="history">演变历程</button></div><div class="sheet-body">${body}</div></section></div>`;
  if (fresh) modalRoot.querySelector(".close")?.focus();
}
function ideaTabContent(idea) {
  if (selectedTab === "analysis")
    return `<section class="analysis-summary"><span>✦ 分析结论</span><p>${esc(idea.summary)}</p></section><div class="score-grid">${metric("可实现性", idea.feasibility)}${metric("潜在价值", idea.impact)}${metric("表达清晰", idea.clarity)}${metric("综合信心", idea.confidence)}</div><section class="risk-box"><small>关键风险 / 待验证假设</small><p>${esc(idea.risk)}</p></section><section class="action-box"><small>推荐的下一步最小行动</small><h3>${esc(idea.nextAction)}</h3><div class="action-actions">${["计划中", "行动中", "已完成", "已搁置"].map((status) => `<button data-action="status" data-id="${esc(idea.id)}" data-status="${status}">${status}</button>`).join("")}</div><div class="edit-row"><button data-action="edit-idea">✎ 编辑想法</button>${ai.apiKey ? `<button data-action="reanalyze-idea" ${reanalyzing ? "disabled" : ""}>${reanalyzing ? "✦ 评估中…" : "✦ AI 重新评估"}</button>` : ""}</div></section>`;
  if (selectedTab === "history") {
    const history = Array.isArray(idea.history) ? idea.history : [];
    if (!history.length)
      return '<div class="history-empty">这个想法还没有演变记录。<br>点击「编辑想法」修改后，每一次改动的原因和目标都会留在这里。</div>';
    return `<div class="history-list">${[...history]
      .reverse()
      .map((entry) => {
        const date = new Date(entry.at);
        const dateText = Number.isNaN(date.getTime())
          ? ""
          : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        const changedTitle =
          entry.before && entry.before.title !== entry.after?.title;
        const changedContent =
          entry.before && entry.before.content !== entry.after?.content;
        return `<article class="history-item${entry.ai ? " ai" : ""}"><div class="history-date">${dateText}${entry.ai ? " · AI 辅助" : ""}</div><div class="history-reason">${esc(entry.reason || "")}</div>${entry.goal ? `<div class="history-goal">${esc(entry.goal)}</div>` : ""}${entry.before && (changedTitle || changedContent) ? `<div class="history-diff">${changedTitle ? `<div><span class="before">${esc(entry.before.title)}</span> → <span class="after">${esc(entry.after?.title || "")}</span></div>` : ""}${changedContent ? `<div><span class="before">${esc((entry.before.content || "").slice(0, 60))}${(entry.before.content || "").length > 60 ? "…" : ""}</span></div><div><span class="after">${esc((entry.after?.content || "").slice(0, 60))}${(entry.after?.content || "").length > 60 ? "…" : ""}</span></div>` : ""}</div>` : ""}</article>`;
      })
      .join("")}</div>`;
  }
  if (selectedTab === "talk") {
    const lead = ai.apiKey
      ? ""
      : `<div class="message"><b>✦ 思考伙伴</b><p>我先挑战一点：${esc(idea.risk)} 你拥有的证据是什么，而不只是直觉？</p></div>`;
    const thinking = chatThinking
      ? `<div class="message thinking"><b>✦ 思考伙伴</b><p>正在结合你的想法组织质疑……</p></div>`
      : "";
    return `<div class="chat" id="chatLog">${lead}${chatMessages.map((message) => `<div class="message ${message.role}"><b>${message.role === "you" ? "你" : "✦ 思考伙伴"}</b><p>${esc(message.text)}</p></div>`).join("")}${thinking}</div><div class="chat-input"><textarea id="chatQuestion" placeholder="解释你的判断，或请它继续质疑……（Enter 发送，Shift+Enter 换行）"></textarea><button class="primary pressable" data-action="send-chat" ${chatThinking ? "disabled" : ""}>发送 ↑</button></div>`;
  }
  if (selectedTab === "research") return researchTabContent(idea);
}
function closeModal() {
  modalRoot.innerHTML = "";
  selectedId = null;
  editingIdea = false;
  restoreFocus();
}
function confirmDelete(idea) {
  rememberFocus();
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="settings glass"><header><div class="mini-logo"><i></i><i></i><i></i></div><div><span>DELETE IDEA</span><h2>删除这个想法？</h2></div><button class="close pressable" data-action="close-modal">×</button></header><p>${esc(idea.title)}</p><p>删除后无法恢复。如果只是暂时不做，建议改为「已搁置」。</p><footer><button data-action="close-modal">取消</button><button class="primary danger pressable" data-action="delete-idea" data-id="${esc(idea.id)}">确认删除</button></footer></section></div>`;
  modalRoot.querySelector(".close")?.focus();
}
function showDataModal() {
  rememberFocus();
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="settings glass"><header><div class="mini-logo"><i></i><i></i><i></i></div><div><span>DATA & BACKUP</span><h2>数据管理</h2></div><button class="close pressable" data-action="close-modal">×</button></header><p>数据只保存在当前设备浏览器里：无痕模式、微信等 App 内置浏览器、或清理浏览器数据都可能导致丢失。建议定期导出备份文件，换设备时导入即可迁移。</p><p>当前已保存 <b>${ideas.length}</b> 个想法。</p><label>导入备份（.json 文件）<input type="file" id="importFile" accept=".json,application/json"></label><footer><button data-action="export-data">导出备份文件</button><button class="primary pressable" data-action="close-modal">完成</button></footer></section></div>`;
  modalRoot.querySelector(".close")?.focus();
  modalRoot.querySelector("#importFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importData(file);
  });
}
function exportData() {
  if (!ideas.length) {
    toast("还没有想法可以导出，先记录一条吧");
    return;
  }
  try {
    const blob = new Blob([JSON.stringify(ideas, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `niansheng-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已导出 ${ideas.length} 个想法的备份文件`);
  } catch {
    toast("导出失败：请使用主流浏览器的最新版本");
  }
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("格式不正确");
      const existing = new Set(ideas.map((item) => item.id));
      const incoming = parsed
        .map(normalizeIdea)
        .filter(Boolean)
        .filter((item) => !existing.has(item.id));
      if (!incoming.length) {
        toast("备份里没有需要导入的新想法");
        return;
      }
      ideas = [...incoming, ...ideas];
      saveIdeas();
      closeModal();
      render(currentView);
      toast(`已导入 ${incoming.length} 个想法`);
    } catch {
      toast("导入失败：请选择本站导出的 .json 备份文件");
    }
  };
  reader.readAsText(file);
}
function celebrate() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = "fireworks";
  document.body.appendChild(canvas);
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.scale(dpr, dpr);
  const colors = ["#f6b352", "#ef7d54", "#4fae7d", "#5b8fd9", "#c86bd9"];
  const parts = [];
  for (let burst = 0; burst < 3; burst++) {
    const bx = innerWidth * (0.3 + Math.random() * 0.4);
    const by = innerHeight * (0.22 + Math.random() * 0.26);
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 2.4 + Math.random() * 3.4;
      parts.push({
        x: bx,
        y: by,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        delay: burst * 220,
        color: colors[(i + burst) % colors.length],
        size: 1.6 + Math.random() * 2.2,
      });
    }
  }
  const t0 = performance.now();
  const step = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    parts.forEach((p) => {
      const lt = t - p.delay;
      if (lt < 0) {
        alive = true;
        return;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.vx *= 0.985;
      p.life -= 0.011;
      if (p.life <= 0) return;
      alive = true;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (alive) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
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
function saveIdeaEdit() {
  const idea = shownIdeas().find((item) => item.id === selectedId);
  if (!idea) return;
  const title = document.querySelector("#editTitle")?.value.trim();
  const content = document.querySelector("#editContent")?.value.trim();
  const reason = document.querySelector("#editReason")?.value.trim();
  const goal = document.querySelector("#editGoal")?.value.trim();
  if (!title || !content) {
    toast("标题和描述不能为空");
    return;
  }
  if (!reason) {
    toast("请填写修改原因——这正是演变记录的价值所在");
    return;
  }
  if (!Array.isArray(idea.history)) idea.history = [];
  idea.history.push({
    at: Date.now(),
    reason,
    goal,
    before: { title: idea.title, content: idea.content },
    after: { title, content },
  });
  idea.title = title;
  idea.content = content;
  idea.updatedAt = Date.now();
  saveIdeas();
  editingIdea = false;
  renderIdeaSheet(idea);
  toast("已保存修改，已记录本次演变");
}
async function reanalyzeIdea() {
  if (!ai.apiKey) {
    toast("连接 AI 后可重新评估");
    return;
  }
  const idea = shownIdeas().find((item) => item.id === selectedId);
  if (!idea || reanalyzing) return;
  reanalyzing = true;
  renderIdeaSheet(idea);
  try {
    const analysis = await analyzeWithModel(idea.content);
    const { title, ...aiFields } = analysis;
    Object.assign(idea, aiFields, { updatedAt: Date.now() });
    if (!Array.isArray(idea.history)) idea.history = [];
    idea.history.push({
      at: Date.now(),
      reason: "AI 重新评估（基于最新描述）",
      ai: true,
    });
    saveIdeas();
    toast("AI 已基于最新描述重新评估");
  } catch (error) {
    toast(error.message || "重新评估失败");
  }
  reanalyzing = false;
  if (sheetStillOpen()) renderIdeaSheet(idea);
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

const RESEARCH_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];
const RESEARCH_TAG_RULES = [
  ["产品", /(产品|发布|上线|版本|更新|功能)/],
  ["AI", /(AI|人工智能|大模型|机器学习|GPT)/i],
  ["融资", /(融资|投资|估值|IPO|收购)/],
  ["市场", /(市场|增长|份额|销售|营收|用户数)/],
  ["政策", /(政策|监管|法规|政府|合规|禁令)/],
  ["研究", /(研究|论文|报告|调查|数据|学术)/],
  ["竞争", /(竞争|对手|超越|对比|反击)/],
  ["争议", /(争议|批评|质疑|风险|诉讼)/],
];
function researchTabContent(idea) {
  const allTags = new Map();
  research.items.forEach((item) =>
    item.tags.forEach((tag) => allTags.set(tag, (allTags.get(tag) || 0) + 1)),
  );
  const tagChips = [...allTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([tag, count]) =>
        `<button class="tag-chip ${research.activeTag === tag ? "active" : ""}" data-action="research-tag" data-tag="${esc(tag)}">${esc(tag)}<small> ${count}</small></button>`,
    )
    .join("");
  const visible = research.activeTag
    ? research.items.filter((item) => item.tags.includes(research.activeTag))
    : research.items;
  const checkedCount = research.items.filter((item) => item.checked).length;
  const list = research.loading
    ? `<div class="loading-line">正在检索「${esc(research.query)}」……${research.usedQueries.length > 1 ? `<br><span class="query-note">检索角度：${research.usedQueries.map((q) => esc(q)).join(" · ")}</span>` : ""}</div>`
    : research.error
      ? `<div class="research-error">检索失败：${esc(research.error)}。可以直接 <a href="https://www.bing.com/news/search?q=${encodeURIComponent(research.query)}" target="_blank" rel="noopener">在 Bing 打开检索结果 ↗</a></div>`
      : `${research.usedQueries.length ? `<div class="query-note">检索角度：${research.usedQueries.map((q) => esc(q)).join(" · ")}　·　${research.items.length} 条结果</div>` : ""}<div class="tag-bar">${tagChips}</div>${
          visible.length
            ? visible
                .map((item) => {
                  const index = research.items.indexOf(item);
                  return `<article class="news-item"><input type="checkbox" data-action="research-check" data-index="${index}" ${item.checked ? "checked" : ""} aria-label="选择此条新闻"><div class="news-body"><div class="news-meta"><span>${esc(item.source)}</span><span>${shortDate(item.date)}</span></div><h4 class="news-title"><a href="${esc(safeHref(item.link))}" target="_blank" rel="noopener">${esc(item.title)}</a></h4><p class="news-snippet">${esc(item.snippet.slice(0, 140))}${item.snippet.length > 140 ? "…" : ""}</p><div class="news-tags">${item.tags.map((tag) => `<button class="news-tag" data-action="research-tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join("")}</div></div></article>`;
                })
                .join("")
            : '<div class="loading-line">没有找到相关新闻，换个关键词试试。</div>'
        }`;
  const foot =
    research.loading || research.error
      ? ""
      : `<div class="research-foot"><button data-action="research-all">全选</button><button data-action="research-clear">清空</button><span class="spacer"></span><button class="primary pressable" data-action="research-summary" ${research.summarizing || !checkedCount ? "disabled" : ""}>${research.summarizing ? "正在总结……" : `AI 总结选中（${checkedCount}）`}</button></div>`;
  return `<section class="analysis-summary"><span>LIVE RESEARCH</span><p>连接 AI 后会自动把你的想法拆解成多个检索角度，同时聚合新闻与网页结果、按时间排序，并过滤低相关内容；结果自带 # 标签，可筛选，勾选后可让 AI 一键总结。</p></section><div class="research-bar"><input id="researchQuery" value="${esc(research.query)}" placeholder="检索关键词" aria-label="检索关键词"><button class="primary pressable" data-action="research-search" ${research.loading ? "disabled" : ""}>${research.loading ? "检索中…" : "检索"}</button></div>${research.summary ? `<div class="summary-box"><small>✦ AI 总结</small>${esc(research.summary)}</div>` : ""}${list}${foot}`;
}
async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
function safeHost(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "来源";
  }
}
function safeHref(link) {
  return /^https?:\/\//i.test(link || "") ? link : "#";
}
function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN");
}
function parseRss(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSS 解析失败");
  return [...doc.querySelectorAll("item")].map((item) => {
    const link = item.querySelector("link")?.textContent?.trim() || "";
    return {
      title: stripHtml(item.querySelector("title")?.textContent || ""),
      link,
      snippet: stripHtml(
        item.querySelector("description")?.textContent || "",
      ),
      source:
        item.getElementsByTagName("News:Source")[0]?.textContent?.trim() ||
        safeHost(link),
      date: item.querySelector("pubDate")?.textContent?.trim() || "",
    };
  });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchFeed(url) {
  let lastError = new Error("网络检索失败");
  for (const build of RESEARCH_PROXIES) {
    try {
      const response = await fetchWithTimeout(build(url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = parseRss(await response.text());
      if (items.length) return items;
      throw new Error("没有解析到结果");
    } catch (error) {
      lastError = error;
    }
  }
  try {
    const data = await (
      await fetchWithTimeout(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
      )
    ).json();
    const items = (data.items || []).map((item) => ({
      title: stripHtml(item.title || ""),
      link: item.link || "",
      snippet: stripHtml(item.description || item.content || ""),
      source: item.author || "Bing",
      date: item.pubDate || "",
    }));
    if (items.length) return items;
  } catch (error) {
    lastError = error;
  }
  throw lastError;
}
async function fetchNewsItems(query) {
  const enc = encodeURIComponent(query);
  const feeds = [
    `https://www.bing.com/news/search?q=${enc}&format=RSS`,
    `https://www.bing.com/search?q=${enc}&format=rss&count=15`,
  ];
  const settled = await Promise.allSettled(
    feeds.map((feed) => fetchFeed(feed)),
  );
  const seen = new Set();
  const merged = [];
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((item) => {
      const titleKey = (item.title || "").replace(/\s+/g, "").toLowerCase();
      if (!titleKey || seen.has(titleKey) || seen.has(item.link)) return;
      seen.add(titleKey);
      if (item.link) seen.add(item.link);
      merged.push(item);
    });
  });
  if (!merged.length) {
    const firstFailure = settled.find((r) => r.status === "rejected");
    if (firstFailure) throw firstFailure.reason;
    throw new Error("没有检索到结果");
  }
  return merged;
}
async function generateSearchQueries(idea) {
  const reply = await callModel(
    [
      {
        role: "system",
        content:
          '你是检索专家。只返回JSON：{"queries":["搜索词",...]}。为这个想法生成4个不同的中文搜索词（每个不超过10个字），分别覆盖：产品与技术动态、竞品与替代方案、用户需求场景、市场与行业情况。不要照抄想法标题，用普通用户会搜索的表达。',
      },
      {
        role: "user",
        content: JSON.stringify({
          title: idea.title,
          content: (idea.content || "").slice(0, 120),
          tags: idea.tags,
        }),
      },
    ],
    0.3,
  );
  const data = parseJson(reply);
  return [
    ...new Set(
      (Array.isArray(data?.queries) ? data.queries : [])
        .filter((q) => typeof q === "string" && q.trim())
        .map((q) => q.trim().slice(0, 14)),
    ),
  ].slice(0, 4);
}
const normalizeTagList = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((tag) => typeof tag === "string" && tag.trim())
    .map((tag) => `#${tag.trim().replace(/^#/, "").slice(0, 12)}`)
    .slice(0, 4);
function heuristicTags(item, query) {
  const text = `${item.title} ${item.snippet}`;
  const tags = RESEARCH_TAG_RULES.filter(([, regex]) => regex.test(text)).map(
    ([name]) => `#${name}`,
  );
  if (tags.length < 2 && query)
    tags.push(`#${query.replace(/\s+/g, "").slice(0, 8)}`);
  return tags.length ? tags.slice(0, 4) : ["#资讯"];
}
async function startResearch(idea) {
  const input = document.querySelector("#researchQuery");
  const rawQuery = (input?.value.trim() || research.query || idea.title || "")
    .trim()
    .slice(0, 60);
  research.query = rawQuery;
  research.usedQueries = [];
  research.loading = true;
  research.error = null;
  research.items = [];
  research.activeTag = null;
  research.summary = "";
  renderIdeaSheet(idea);
  let queries = [rawQuery];
  if (ai.apiKey) {
    try {
      const aiQueries = await generateSearchQueries(idea);
      if (aiQueries.length) queries = aiQueries;
    } catch {}
  }
  research.usedQueries = queries;
  renderIdeaSheet(idea);
  const settled = await Promise.allSettled(
    queries.map((query, index) =>
      delay(index * 150).then(() => fetchNewsItems(query)),
    ),
  );
  const seen = new Set();
  const merged = [];
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((item) => {
      const titleKey = (item.title || "").replace(/\s+/g, "").toLowerCase();
      if (!titleKey || seen.has(titleKey) || seen.has(item.link)) return;
      seen.add(titleKey);
      if (item.link) seen.add(item.link);
      merged.push(item);
    });
  });
  if (!merged.length) {
    const failure = settled.find((r) => r.status === "rejected");
    research.error = failure?.reason?.message || "检索失败";
  } else {
    merged.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    research.items = merged.slice(0, 40);
    research.items.forEach((item) => {
      item.tags = heuristicTags(item, rawQuery);
      item.checked = false;
    });
  }
  research.loading = false;
  if (sheetStillOpen()) renderIdeaSheet(idea);
  if (research.items.length && ai.apiKey) refineTagsAndRelevance(idea);
}
async function refineTagsAndRelevance(idea) {
  const st = research;
  if (!st.items.length) return;
  st.tagging = true;
  const before = st.items.length;
  try {
    const reply = await callModel(
      [
        {
          role: "system",
          content:
            '你是新闻筛选与标注器。只返回JSON：{"keep":[索引,...],"tags":[["#标签","#标签"],...]}。判断每条结果是否与想法真正相关（产品、技术、竞品、用户需求、市场动态相关则保留；泛生活常识、穿搭建议类丢弃），keep只包含相关条目的索引。tags与keep一一对应，每个2-3个中文#标签（不超过6字，以#开头）。',
        },
        {
          role: "user",
          content: JSON.stringify({
            idea: idea.title,
            need: (idea.content || "").slice(0, 80),
            items: st.items.slice(0, 30).map((item, index) => ({
              i: index,
              t: item.title,
              s: item.snippet.slice(0, 90),
            })),
          }),
        },
      ],
      0.2,
    );
    const data = parseJson(reply);
    const keep = Array.isArray(data?.keep)
      ? data.keep.map(Number).filter((n) => Number.isInteger(n))
      : null;
    const tagQueue = Array.isArray(data?.tags)
      ? data.tags.map(normalizeTagList)
      : [];
    if (keep) {
      const relevant = [];
      st.items.forEach((item, index) => {
        const inPayload = index < 30;
        if (inPayload && !keep.includes(index)) return;
        const position = keep.indexOf(index);
        const candidate =
          inPayload && position >= 0 ? tagQueue[position] : null;
        if (candidate && candidate.length) item.tags = candidate;
        relevant.push(item);
      });
      if (relevant.length) st.items = relevant;
    } else {
      st.items.forEach((item, index) => {
        const candidate = tagQueue[index];
        if (candidate && candidate.length) item.tags = candidate;
      });
    }
  } catch {}
  st.tagging = false;
  const removed = before - st.items.length;
  if (removed > 0 && sheetStillOpen()) toast(`AI 已过滤 ${removed} 条低相关结果`);
  if (
    sheetStillOpen() &&
    selectedTab === "research" &&
    !research.loading &&
    !research.error
  )
    renderIdeaSheet(shownIdeas().find((item) => item.id === selectedId));
}
async function summarizeSelected(idea) {
  if (!ai.apiKey) {
    toast("连接 AI 后可用模型一键总结");
    return;
  }
  const picked = research.items.filter((item) => item.checked);
  if (!picked.length) {
    toast("先勾选要总结的新闻");
    return;
  }
  research.summarizing = true;
  renderIdeaSheet(idea);
  try {
    research.summary = await callModel(
      [
        {
          role: "system",
          content:
            "你是研究助理。只基于给定的新闻条目做事实性总结，不编造未提供的信息。用中文输出三部分：①总体形势（两句话内）；②关键要点（每行一条，以·开头并注明来源）；③对该想法的启示（一句话）。",
        },
        {
          role: "user",
          content: JSON.stringify({
            idea: { title: idea.title, summary: idea.summary, risk: idea.risk },
            items: picked.map((item) => ({
              title: item.title,
              source: item.source,
              date: item.date,
              snippet: item.snippet.slice(0, 140),
              tags: item.tags,
            })),
          }),
        },
      ],
      0.4,
    );
  } catch (error) {
    research.summary = "";
    toast(error.message || "总结失败");
  }
  research.summarizing = false;
  if (sheetStillOpen()) renderIdeaSheet(idea);
}

function showAiSettings() {
  rememberFocus();
  let remembered = false;
  try {
    remembered = Boolean(localStorage.getItem(AI_STORAGE_KEY));
  } catch {}
  modalRoot.innerHTML = `<div class="scrim" data-action="close-modal"><section class="settings glass"><header><div class="mini-logo"><i></i><i></i><i></i></div><div><span>REAL MODEL CONNECTION</span><h2>连接真实大模型</h2></div><button class="close pressable" data-action="close-modal">×</button></header><p>GitHub Pages 没有服务器。默认密钥只保留在当前页面内存，刷新后即消失；勾选「记住密钥」后会保存在本浏览器中，下次打开自动连接。请勿在公用设备上勾选。推荐使用支持浏览器请求的 OpenRouter。</p><label>服务商<select id="provider"><option value="openrouter" ${ai.provider === "openrouter" ? "selected" : ""}>OpenRouter（推荐）</option><option value="openai" ${ai.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="deepseek" ${ai.provider === "deepseek" ? "selected" : ""}>DeepSeek</option></select></label><label>模型名称<input id="model" value="${esc(ai.model)}"></label><label>API Key<input id="apiKey" type="password" autocomplete="off" value="${esc(ai.apiKey)}" placeholder="仅保留到页面关闭"></label><label class="remember-row"><input type="checkbox" id="rememberKey" ${remembered ? "checked" : ""}>记住密钥（保存在本浏览器，刷新/关闭后仍有效）</label><div class="security">密钥由浏览器直接发送至所选模型服务，本站服务器不经手；勾选记住后仅写入本浏览器本地存储。请使用可撤销、有限额的个人密钥。</div><footer><button data-action="close-modal">取消</button><button class="primary pressable" data-action="save-ai">保存连接</button></footer></section></div>`;
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
  const remember = document.querySelector("#rememberKey")?.checked;
  try {
    if (remember && ai.apiKey) {
      localStorage.setItem(
        AI_STORAGE_KEY,
        JSON.stringify({
          provider: ai.provider,
          model: ai.model,
          apiKey: ai.apiKey,
        }),
      );
    } else {
      localStorage.removeItem(AI_STORAGE_KEY);
    }
  } catch {}
  closeModal();
  updateChrome();
  toast(
    remember && ai.apiKey
      ? "已连接，密钥已记住（仅本浏览器）"
      : ai.apiKey
        ? "真实大模型已连接；密钥不会持久化"
        : "已切换为本地分析引擎",
  );
}

const OCEAN_EDGE_TYPES = {
  相似: "#2e6b4e",
  互补: "#1f7a72",
  依赖: "#2b6cb0",
  先后: "#6b46c1",
  包含: "#975a16",
  冲突: "#c53030",
  资源复用: "#4a7a5c",
};
let oceanState = null;

async function openOcean() {
  if (document.querySelector("#ocean")) return;
  const list = shownIdeas();
  modalRoot.innerHTML = `<section class="ocean" id="ocean"><canvas></canvas><div class="ocean-grain"></div><div class="ocean-viewport"><svg class="ocean-svg" id="oceanSvg"></svg><div class="ocean-nodes" id="oceanNodes"></div></div><header class="ocean-toolbar glass"><div><span>AI IDEA OCEAN</span><h2>想法关系海</h2><p>按住海面拖动 · 悬停想法查看关系 · 点击查看详情</p></div><div class="engine-state"><i></i><b id="oceanStatus">${ai.apiKey ? "AI 正在分析想法结构…" : "本地模式 · 按标签聚类"}</b></div><button class="panel-toggle pressable" data-action="ocean-panel">洞察</button><button class="close pressable" data-action="close-ocean">×</button></header><div class="ocean-legend" id="oceanLegend" hidden></div><aside class="ocean-panel glass" id="oceanPanel"></aside><div class="ocean-hint glass" id="oceanHint" hidden></div><div class="drag-hint">拖动漫游 · 滚轮缩放 · 右侧洞察面板可跳转聚焦</div></section>`;
  const oceanEl = document.querySelector("#ocean");
  const canvas = oceanEl.querySelector("canvas");
  rememberFocus();
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  const clusters = clusterizeByTags(list);
  oceanState = {
    list,
    clusters,
    edges: [],
    advice: "",
    modelDone: false,
    pan: { x: 0, y: 0 },
    zoom: 1,
    drag: null,
    pointer: { x: innerWidth / 2, y: innerHeight / 2 },
    focus: null,
    pinned: false,
    activeType: null,
    activeCluster: null,
    pos: new Map(),
    centers: [],
    zoneR: [],
    clusterOf: new Map(),
    neighbors: new Map(),
    degree: new Map(),
    insights: { hubs: [], orphans: [], conflicts: [], mergeable: [] },
    viewW: innerWidth,
    viewH: innerHeight,
  };
  rebuildOceanLayout();
  renderOceanWorld();
  renderOceanLegend();
  renderOceanPanel();
  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    oceanState.viewW = innerWidth;
    oceanState.viewH = innerHeight;
    applyOceanPan();
  };
  const down = (event) => {
    if (
      event.target.closest(".ocean-node") ||
      event.target.closest(".ocean-toolbar") ||
      event.target.closest(".ocean-panel") ||
      event.target.closest(".ocean-legend") ||
      event.target.closest(".ocean-hint")
    )
      return;
    oceanEl.setPointerCapture(event.pointerId);
    oceanState.drag = {
      x: event.clientX,
      y: event.clientY,
      ox: oceanState.pan.x,
      oy: oceanState.pan.y,
    };
  };
  const move = (event) => {
    oceanState.pointer = { x: event.clientX, y: event.clientY };
    if (!oceanState.drag) return;
    oceanState.pan = {
      x: oceanState.drag.ox + event.clientX - oceanState.drag.x,
      y: oceanState.drag.oy + event.clientY - oceanState.drag.y,
    };
    applyOceanPan();
  };
  const up = () => (oceanState.drag = null);
  const wheel = (event) => {
    if (
      event.target.closest(".ocean-panel") ||
      event.target.closest(".ocean-toolbar") ||
      event.target.closest(".ocean-legend") ||
      event.target.closest(".ocean-hint")
    )
      return;
    event.preventDefault();
    const st = oceanState;
    if (!st) return;
    const cx = event.clientX - st.viewW / 2;
    const cy = event.clientY - st.viewH / 2;
    const worldX = (cx - st.pan.x) / st.zoom;
    const worldY = (cy - st.pan.y) / st.zoom;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = Math.max(0.4, Math.min(2.5, st.zoom * factor));
    if (zoom === st.zoom) return;
    st.zoom = zoom;
    st.pan = { x: cx - worldX * zoom, y: cy - worldY * zoom };
    applyOceanPan();
  };
  const over = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const node = event.target.closest(".ocean-node");
    if (node) setOceanFocus(node.dataset.id, false);
  };
  const out = (event) => {
    if (event.target.closest(".ocean-node") && !oceanState.pinned)
      setOceanFocus(null, false);
  };
  resize();
  addEventListener("resize", resize);
  oceanEl.addEventListener("pointerdown", down);
  oceanEl.addEventListener("pointermove", move);
  oceanEl.addEventListener("pointerup", up);
  oceanEl.addEventListener("wheel", wheel, { passive: false });
  oceanEl.addEventListener("pointerover", over);
  oceanEl.addEventListener("pointerout", out);
  let frame = 0;
  if (ctx) {
    const start = performance.now();
    const draw = (now) => {
      drawOcean(
        ctx,
        innerWidth,
        innerHeight,
        (now - start) / 1000,
        oceanState?.pointer || { x: innerWidth / 2, y: innerHeight / 2 },
      );
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  }
  oceanEl.querySelector(".close")?.focus();
  oceanCleanup = () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
  };
  if (ai.apiKey) {
    try {
      const result = await analyzeOceanModel(list);
      if (!document.querySelector("#ocean")) {
        oceanState = null;
        return;
      }
      if (result.clusters.length) oceanState.clusters = result.clusters;
      oceanState.edges = result.edges;
      oceanState.advice = result.advice;
      oceanState.modelDone = true;
      rebuildOceanLayout();
      renderOceanWorld();
      renderOceanLegend();
      renderOceanPanel();
      document.querySelector("#oceanStatus").textContent = `AI 已完成分析 · ${oceanState.clusters.length} 个簇群 · ${oceanState.edges.length} 条关系`;
    } catch (error) {
      if (document.querySelector("#ocean")) {
        document.querySelector("#oceanStatus").textContent =
          "AI 分析失败 · 已降级为标签聚类";
        toast(error.message || "关系分析失败，已使用本地聚类");
      }
    }
  }
}
function closeOcean() {
  oceanCleanup?.();
  oceanCleanup = null;
  oceanState = null;
  modalRoot.innerHTML = "";
  restoreFocus();
}
function clusterizeByTags(list) {
  const groups = new Map();
  list.forEach((item) => {
    const key = item.tags?.[0] || "其他";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.id);
  });
  return [...groups.entries()].map(([label, ids]) => ({ label, ids }));
}
function dedupeClusters(clusters, validIds) {
  const used = new Set();
  const out = [];
  clusters.forEach((cluster) => {
    const ids = cluster.ids.filter((id) => !used.has(id));
    ids.forEach((id) => used.add(id));
    if (ids.length) out.push({ label: cluster.label, ids });
  });
  const rest = [...validIds].filter((id) => !used.has(id));
  if (rest.length) out.push({ label: "其他", ids: rest });
  return out;
}
async function analyzeOceanModel(list) {
  const reply = await callModel(
    [
      {
        role: "system",
        content:
          '你是想法架构师。分析想法集合的语义结构，只返回JSON：{"clusters":[{"label":"主题名(不超过6字)","ids":["id"]}],"edges":[{"sourceId":"id","targetId":"id","type":"相似|依赖|先后|包含|互补|冲突|资源复用","reason":"不超过16字","strength":0到1}],"advice":"一句话整体建议，不超过40字"}。规则：每个想法必须且只能归入一个集群；只能使用提供的id；每个想法最多3条边；没有真实语义关系就不要造边；strength表示关系强度0-1。',
      },
      {
        role: "user",
        content: JSON.stringify(
          list.slice(0, 30).map((item) => ({
            id: item.id,
            title: item.title,
            content: (item.content || "").slice(0, 80),
            tags: item.tags,
          })),
        ),
      },
    ],
    0.2,
  );
  const data = parseJson(reply);
  const valid = new Set(list.map((item) => item.id));
  const types = Object.keys(OCEAN_EDGE_TYPES);
  const clusters = dedupeClusters(
    (Array.isArray(data.clusters) ? data.clusters : [])
      .map((cluster) => ({
        label: String(cluster?.label || "未分组").slice(0, 8),
        ids: (Array.isArray(cluster?.ids) ? cluster.ids : []).filter((id) =>
          valid.has(id),
        ),
      }))
      .filter((cluster) => cluster.ids.length),
    valid,
  );
  const seen = new Set();
  const edges = (Array.isArray(data.edges) ? data.edges : [])
    .filter(
      (edge) =>
        valid.has(edge?.sourceId) &&
        valid.has(edge?.targetId) &&
        edge.sourceId !== edge.targetId &&
        types.includes(edge?.type),
    )
    .map((edge) => ({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      reason: String(edge?.reason || "").slice(0, 24),
      strength: Math.max(0.1, Math.min(1, Number(edge?.strength) || 0.5)),
    }))
    .filter((edge) => {
      const key = [edge.sourceId, edge.targetId].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
  return {
    clusters: clusters.length ? clusters : clusterizeByTags(list),
    edges,
    advice: String(data.advice || "").slice(0, 60),
  };
}
function computeInsights(list, edges) {
  const degree = new Map(list.map((item) => [item.id, 0]));
  edges.forEach((edge) => {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) || 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) || 0) + 1);
  });
  const title = (id) => list.find((item) => item.id === id)?.title || id;
  return {
    hubs: [...degree.entries()]
      .filter(([, d]) => d >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, d]) => ({ id, title: title(id), d })),
    orphans: list
      .filter((item) => (degree.get(item.id) || 0) === 0)
      .map((item) => ({ id: item.id, title: item.title })),
    conflicts: edges
      .filter((edge) => edge.type === "冲突")
      .map((edge) => ({
        ...edge,
        a: title(edge.sourceId),
        b: title(edge.targetId),
      })),
    mergeable: edges
      .filter((edge) => edge.type === "相似" && edge.strength >= 0.75)
      .slice(0, 3)
      .map((edge) => ({
        ...edge,
        a: title(edge.sourceId),
        b: title(edge.targetId),
      })),
  };
}
function buildOceanLayout(list, clusters, edges) {
  const clusterOf = new Map();
  clusters.forEach((cluster, k) =>
    cluster.ids.forEach((id) => clusterOf.set(id, k)),
  );
  const K = Math.max(1, clusters.length);
  const ring = 300 + K * 95;
  const centers = clusters.map((_, k) => {
    const angle = (k / K) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring * 0.8 };
  });
  const zoneR = clusters.map(
    (cluster) => 130 + 34 * Math.sqrt(cluster.ids.length),
  );
  const pos = new Map();
  clusters.forEach((cluster, k) => {
    const n = cluster.ids.length;
    cluster.ids.forEach((id, i) => {
      const angle = (i / n) * Math.PI * 2 + k * 0.7;
      const r = n === 1 ? 0 : zoneR[k] * 0.5;
      pos.set(id, {
        x: centers[k].x + Math.cos(angle) * r,
        y: centers[k].y + Math.sin(angle) * r,
      });
    });
  });
  const ids = list.map((item) => item.id);
  for (let tick = 0; tick < 150; tick++) {
    const alpha = 1 - tick / 150;
    const fx = new Map(ids.map((id) => [id, 0]));
    const fy = new Map(ids.map((id) => [id, 0]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        if (clusterOf.get(a) !== clusterOf.get(b)) continue;
        const pa = pos.get(a);
        const pb = pos.get(b);
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = i % 2 ? 1 : -1;
          dy = j % 2 ? 1 : -1;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const force = Math.min(1400 / d2, 2.2);
        const ux = (dx / d) * force;
        const uy = (dy / d) * force;
        fx.set(a, fx.get(a) + ux);
        fy.set(a, fy.get(a) + uy);
        fx.set(b, fx.get(b) - ux);
        fy.set(b, fy.get(b) - uy);
      }
    }
    edges.forEach((edge) => {
      if (clusterOf.get(edge.sourceId) !== clusterOf.get(edge.targetId))
        return;
      const pa = pos.get(edge.sourceId);
      const pb = pos.get(edge.targetId);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const force = ((d - 165) / d) * 0.045;
      const ux = dx * force;
      const uy = dy * force;
      fx.set(edge.sourceId, fx.get(edge.sourceId) + ux);
      fy.set(edge.sourceId, fy.get(edge.sourceId) + uy);
      fx.set(edge.targetId, fx.get(edge.targetId) - ux);
      fy.set(edge.targetId, fy.get(edge.targetId) - uy);
    });
    ids.forEach((id) => {
      const k = clusterOf.get(id) ?? 0;
      const p = pos.get(id);
      let vx = (fx.get(id) + (centers[k].x - p.x) * 0.05) * alpha;
      let vy = (fy.get(id) + (centers[k].y - p.y) * 0.05) * alpha;
      const vlen = Math.hypot(vx, vy);
      if (vlen > 26) {
        vx = (vx / vlen) * 26;
        vy = (vy / vlen) * 26;
      }
      p.x += vx;
      p.y += vy;
      const dx = p.x - centers[k].x;
      const dy = p.y - centers[k].y;
      const d = Math.hypot(dx, dy);
      const max = zoneR[k] * 0.92;
      if (d > max) {
        p.x = centers[k].x + (dx / d) * max;
        p.y = centers[k].y + (dy / d) * max;
      }
    });
  }
  return { pos, centers, zoneR, clusterOf };
}
function rebuildOceanLayout() {
  const st = oceanState;
  const layout = buildOceanLayout(st.list, st.clusters, st.edges);
  st.pos = layout.pos;
  st.centers = layout.centers;
  st.zoneR = layout.zoneR;
  st.clusterOf = layout.clusterOf;
  st.degree = new Map(st.list.map((item) => [item.id, 0]));
  st.neighbors = new Map(st.list.map((item) => [item.id, new Set()]));
  st.edges.forEach((edge) => {
    st.degree.set(edge.sourceId, (st.degree.get(edge.sourceId) || 0) + 1);
    st.degree.set(edge.targetId, (st.degree.get(edge.targetId) || 0) + 1);
    st.neighbors.get(edge.sourceId)?.add(edge.targetId);
    st.neighbors.get(edge.targetId)?.add(edge.sourceId);
  });
  st.insights = computeInsights(st.list, st.edges);
}
function applyOceanPan() {
  const st = oceanState;
  if (!st) return;
  const layer = document.querySelector("#oceanLayer");
  const nodes = document.querySelector("#oceanNodes");
  if (layer)
    layer.setAttribute(
      "transform",
      `translate(${st.viewW / 2 + st.pan.x} ${st.viewH / 2 + st.pan.y}) scale(${st.zoom})`,
    );
  if (nodes)
    nodes.style.transform = `translate(${st.viewW / 2 + st.pan.x}px, ${st.viewH / 2 + st.pan.y}px) scale(${st.zoom})`;
}
function renderOceanWorld() {
  const st = oceanState;
  if (!st) return;
  const svg = document.querySelector("#oceanSvg");
  const nodesBox = document.querySelector("#oceanNodes");
  if (!svg || !nodesBox) return;
  const showLabels = st.edges.length <= 12;
  const zoneMarkup = st.clusters
    .map((cluster, k) => {
      const dim = st.activeCluster != null && st.activeCluster !== k;
      return `<g class="ozone ${dim ? "dim" : ""}"><circle cx="${st.centers[k].x}" cy="${st.centers[k].y}" r="${st.zoneR[k]}" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.55)" stroke-dasharray="7 9"></circle><text class="zlabel" x="${st.centers[k].x}" y="${st.centers[k].y - st.zoneR[k] - 12}" text-anchor="middle">${esc(cluster.label)} · ${cluster.ids.length}</text></g>`;
    })
    .join("");
  const edgeMarkup = st.edges
    .map((edge, i) => {
      const a = st.pos.get(edge.sourceId);
      const b = st.pos.get(edge.targetId);
      if (!a || !b) return "";
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const bend = (i % 2 ? 1 : -1) * (10 + (i % 3) * 8);
      const cx = mx + (nx / nl) * bend;
      const cy = my + (ny / nl) * bend;
      const color = OCEAN_EDGE_TYPES[edge.type] || "#4a7a5c";
      const width = 1 + edge.strength * 2.4;
      const typeDim = st.activeType && st.activeType !== edge.type;
      const clusterDim =
        st.activeCluster != null &&
        (st.clusterOf.get(edge.sourceId) !== st.activeCluster ||
          st.clusterOf.get(edge.targetId) !== st.activeCluster);
      const dim = typeDim || clusterDim;
      const label = showLabels && !dim;
      return `<path class="oedge ${dim ? "dim" : ""}" data-edge="${i}" d="M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}" stroke="${color}" stroke-width="${width}" fill="none"></path>${label ? `<text class="elabel" x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${color}">${esc(edge.type)}</text>` : ""}`;
    })
    .join("");
  svg.innerHTML = `<g id="oceanLayer" transform="translate(${st.viewW / 2 + st.pan.x} ${st.viewH / 2 + st.pan.y}) scale(${st.zoom})">${zoneMarkup}${edgeMarkup}</g>`;
  nodesBox.innerHTML = st.list
    .map((idea) => {
      const p = st.pos.get(idea.id);
      if (!p) return "";
      const k = st.clusterOf.get(idea.id) ?? 0;
      const deg = st.degree.get(idea.id) || 0;
      const isOrphan = st.modelDone && deg === 0;
      const dim =
        (st.activeCluster != null && k !== st.activeCluster) ||
        (st.activeType && !st.edges.some(
          (edge) =>
            edge.type === st.activeType &&
            (edge.sourceId === idea.id || edge.targetId === idea.id),
        ));
      return `<button class="ocean-node pressable ${dim ? "dim" : ""} ${isOrphan ? "island" : ""}" data-action="ocean-idea" data-id="${esc(idea.id)}" style="left:${p.x}px;top:${p.y}px"><span>${esc(st.clusters[k]?.label || "想法")}</span><h3>${esc(idea.title)}</h3><div><small>${esc(idea.status)}${deg ? ` · ${deg} 条关系` : ""}</small><b>${idea.confidence}</b></div></button>`;
    })
    .join("");
  applyOceanPan();
  applyFocusClasses();
}
function renderOceanLegend() {
  const st = oceanState;
  const box = document.querySelector("#oceanLegend");
  if (!st || !box) return;
  const counts = {};
  st.edges.forEach((edge) => {
    counts[edge.type] = (counts[edge.type] || 0) + 1;
  });
  box.innerHTML = Object.entries(OCEAN_EDGE_TYPES)
    .filter(([type]) => counts[type])
    .map(
      ([type, color]) =>
        `<button class="legend-chip ${st.activeType === type ? "active" : ""}" data-action="ocean-type" data-type="${esc(type)}"><i style="background:${color}"></i>${esc(type)}<small>${counts[type]}</small></button>`,
    )
    .join("");
  box.hidden = !st.edges.length;
}
function renderOceanPanel() {
  const st = oceanState;
  const box = document.querySelector("#oceanPanel");
  if (!st || !box) return;
  const { insights } = st;
  const clustersBlock = st.clusters
    .map(
      (cluster, k) =>
        `<button class="panel-row ${st.activeCluster === k ? "active" : ""}" data-action="ocean-cluster" data-cluster="${k}"><span>${esc(cluster.label)}</span><b>${cluster.ids.length}</b></button>`,
    )
    .join("");
  const hubsBlock = insights.hubs
    .map(
      (hub) =>
        `<button class="panel-row" data-action="ocean-focus" data-id="${esc(hub.id)}"><span>枢纽 · ${esc(hub.title)}</span><b>${hub.d}</b></button>`,
    )
    .join("");
  const orphanBlock = insights.orphans
    .map(
      (orphan) =>
        `<button class="panel-row island" data-action="ocean-focus" data-id="${esc(orphan.id)}"><span>孤岛 · ${esc(orphan.title)}</span><b>0</b></button>`,
    )
    .join("");
  const conflictBlock = insights.conflicts
    .map(
      (conflict) =>
        `<button class="panel-row conflict" data-action="ocean-focus" data-id="${esc(conflict.sourceId)}"><span>冲突 · ${esc(conflict.a)} × ${esc(conflict.b)}</span><b>${esc(conflict.reason)}</b></button>`,
    )
    .join("");
  const mergeBlock = insights.mergeable
    .map(
      (merge) =>
        `<button class="panel-row" data-action="ocean-focus" data-id="${esc(merge.sourceId)}"><span>可合并 · ${esc(merge.a)} ≈ ${esc(merge.b)}</span><b>${Math.round(merge.strength * 100)}%</b></button>`,
    )
    .join("");
  box.innerHTML = `<div class="panel-head"><span>OCEAN INSIGHTS</span><b>${st.list.length} 个想法 · ${st.edges.length} 条关系</b>${st.advice ? `<p>${esc(st.advice)}</p>` : ""}</div><div class="panel-sec"><small>想法簇群</small>${clustersBlock}</div>${st.modelDone ? `<div class="panel-sec"><small>枢纽想法</small>${hubsBlock || '<p class="empty-tip">还没有想法形成多条连接</p>'}</div>` : ""}${st.modelDone && orphanBlock ? `<div class="panel-sec"><small>孤岛想法 · 尚未连接</small>${orphanBlock}</div>` : ""}${conflictBlock ? `<div class="panel-sec"><small>需要注意的冲突</small>${conflictBlock}</div>` : ""}${mergeBlock ? `<div class="panel-sec"><small>相似度极高 · 可考虑合并</small>${mergeBlock}</div>` : ""}${!st.modelDone ? '<div class="panel-note">本地模式：按标签聚类展示，不制造假关系。连接 AI 接口后可解锁语义关系、冲突检测与合并建议。</div>' : ""}`;
}
function setOceanFocus(id, pinned) {
  const st = oceanState;
  if (!st) return;
  st.focus = id;
  st.pinned = Boolean(pinned) && Boolean(id);
  applyFocusClasses();
}
function applyFocusClasses() {
  const st = oceanState;
  if (!st) return;
  const focus = st.focus;
  const neighbors = focus ? st.neighbors.get(focus) : null;
  document
    .querySelectorAll("#oceanSvg .oedge")
    .forEach((path) => {
      const edge = st.edges[Number(path.dataset.edge)];
      const on = Boolean(focus && edge && (edge.sourceId === focus || edge.targetId === focus));
      path.classList.toggle("hot", on);
      path.classList.toggle("fade", Boolean(focus) && !on);
    });
  document
    .querySelectorAll("#oceanSvg .elabel")
    .forEach((label) => {
      const edge = st.edges[Number(label.dataset.edge || -1)];
      const on = Boolean(focus && edge && (edge.sourceId === focus || edge.targetId === focus));
      label.classList.toggle("hot", on);
      label.classList.toggle("fade", Boolean(focus) && !on);
    });
  document.querySelectorAll("#oceanNodes .ocean-node").forEach((node) => {
    const id = node.dataset.id;
    const on = !focus || id === focus || neighbors?.has(id);
    node.classList.toggle("dim", !on);
  });
  const hint = document.querySelector("#oceanHint");
  if (!hint) return;
  if (!focus) {
    hint.hidden = true;
    return;
  }
  const idea = st.list.find((item) => item.id === focus);
  const rels = st.edges
    .filter((edge) => edge.sourceId === focus || edge.targetId === focus)
    .map((edge) => ({
      ...edge,
      other: st.list.find(
        (item) => item.id === (edge.sourceId === focus ? edge.targetId : edge.sourceId),
      )?.title || "",
    }));
  hint.innerHTML = `<small>${esc(idea?.title || "")} 的关系</small>${
    rels.length
      ? rels
          .map(
            (rel) =>
              `<div class="hint-row"><i style="background:${OCEAN_EDGE_TYPES[rel.type] || "#4a7a5c"}"></i><b>${esc(rel.type)}</b><span>${esc(rel.other)}${rel.reason ? ` — ${esc(rel.reason)}` : ""}</span></div>`,
          )
          .join("")
      : '<p class="empty-tip">这个想法还没有建立任何关系。</p>'
  }`;
  hint.hidden = false;
}
function centerOnOceanNode(id) {
  const st = oceanState;
  const p = st?.pos.get(id);
  if (!p) return;
  st.pan = { x: -p.x * st.zoom, y: -p.y * st.zoom };
  applyOceanPan();
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
  if (action === "open-idea") {
    const tab = target.dataset.tab === "talk" ? "talk" : "analysis";
    if (target.closest(".idea-card")) {
      clearTimeout(cardClickTimer);
      const id = target.dataset.id;
      cardClickTimer = setTimeout(() => openIdea(id, tab), 260);
    } else {
      openIdea(target.dataset.id, tab);
    }
  }
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
    editingIdea = false;
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
    if (
      selectedTab === "research" &&
      idea &&
      !research.items.length &&
      !research.loading &&
      !research.error
    )
      startResearch(idea);
  }
  if (action === "send-chat") sendChat();
  if (action === "research-search") {
    const idea = shownIdeas().find((item) => item.id === selectedId);
    if (idea && !research.loading) startResearch(idea);
  }
  if (action === "research-tag") {
    research.activeTag =
      research.activeTag === target.dataset.tag ? null : target.dataset.tag;
    renderIdeaSheet(shownIdeas().find((item) => item.id === selectedId));
  }
  if (action === "research-all" || action === "research-clear") {
    const checked = action === "research-all";
    research.items.forEach((item) => (item.checked = checked));
    renderIdeaSheet(shownIdeas().find((item) => item.id === selectedId));
  }
  if (action === "research-summary") {
    const idea = shownIdeas().find((item) => item.id === selectedId);
    if (idea) summarizeSelected(idea);
  }
  if (action === "delete-idea") {
    const index = ideas.findIndex((item) => item.id === target.dataset.id);
    if (index >= 0) {
      const [removed] = ideas.splice(index, 1);
      saveIdeas();
      closeModal();
      render(currentView);
      toast(`已删除「${removed.title.slice(0, 14)}」`);
    }
  }
  if (action === "edit-idea") {
    editingIdea = true;
    renderIdeaSheet(shownIdeas().find((item) => item.id === selectedId));
  }
  if (action === "cancel-edit") {
    editingIdea = false;
    renderIdeaSheet(shownIdeas().find((item) => item.id === selectedId));
  }
  if (action === "save-edit") saveIdeaEdit();
  if (action === "reanalyze-idea") reanalyzeIdea();
  if (action === "open-data") showDataModal();
  if (action === "export-data") exportData();
  if (action === "save-ai") saveAi();
  if (action === "open-ocean") openOcean();
  if (action === "close-ocean") closeOcean();
  if (action === "ocean-idea") {
    closeOcean();
    openIdea(target.dataset.id);
  }
  if (action === "ocean-type") {
    if (!oceanState) return;
    oceanState.activeType =
      oceanState.activeType === target.dataset.type
        ? null
        : target.dataset.type;
    renderOceanWorld();
    renderOceanLegend();
  }
  if (action === "ocean-cluster") {
    if (!oceanState) return;
    const k = Number(target.dataset.cluster);
    oceanState.activeCluster = oceanState.activeCluster === k ? null : k;
    oceanState.focus = null;
    oceanState.pinned = false;
    renderOceanWorld();
    renderOceanPanel();
  }
  if (action === "ocean-focus") {
    if (!oceanState) return;
    setOceanFocus(target.dataset.id, true);
    centerOnOceanNode(target.dataset.id);
  }
  if (action === "ocean-panel")
    document.querySelector("#ocean")?.classList.toggle("panel-open");
});
document.addEventListener("change", (event) => {
  if (event.target.matches('[data-action="status-select"]'))
    changeStatus(event.target.dataset.id, event.target.value);
  if (event.target.id === "provider")
    document.querySelector("#model").value =
      providers[event.target.value].model;
  if (event.target.matches('[data-action="research-check"]')) {
    const item = research.items[Number(event.target.dataset.index)];
    if (item) item.checked = event.target.checked;
  }
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
document.addEventListener("dblclick", (event) => {
  const card = event.target.closest(".idea-card");
  if (!card) return;
  event.preventDefault();
  clearTimeout(cardClickTimer);
  const idea = ideas.find((item) => item.id === card.dataset.id);
  if (!idea) {
    toast("这是体验示例，记录自己的想法后即可管理");
    return;
  }
  confirmDelete(idea);
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
  if (status === "已完成") celebrate();
}

updateChrome();
render("today");
