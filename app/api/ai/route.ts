import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { readJsonRecord } from "../../account-auth";

const providers = {
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini",
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4.1-mini",
  },
} as const;

type Provider = keyof typeof providers;
type AiRequest = {
  action?: "analyze" | "chat" | "relations";
  provider?: Provider;
  model?: string;
  idea?: {
    id?: string;
    title?: string;
    content?: string;
    summary?: string;
    risk?: string;
    intent?: string;
  };
  question?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
  ideas?: { id: string; title: string; content: string; tags?: string[] }[];
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({
    serverConfigured: Boolean(env.AI_API_KEY),
    provider: env.AI_PROVIDER || "openai",
    model: env.AI_MODEL || providers.openai.model,
    providers: Object.entries(providers).map(([id, value]) => ({
      id,
      name: value.name,
      defaultModel: value.model,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const record = await readJsonRecord(request, 100_000);
  if (!record) return Response.json({ error: '请求格式无效' }, { status: 400 });
  const input = record as AiRequest;
  if (!['analyze','chat','relations'].includes(String(input.action))) return Response.json({error:'无效的 AI 操作'},{status:400});
  const requestedProvider =
    input.provider || (env.AI_PROVIDER as Provider) || "openai";
  const provider =
    Object.hasOwn(providers, requestedProvider) ? requestedProvider : "openai";
  const config = providers[provider];
  const clientKey = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const apiKey = clientKey || env.AI_API_KEY;
  if (!apiKey)
    return Response.json(
      {
        error: "NO_KEY",
        message: "尚未连接真实大模型，请在 AI 接口中输入密钥。",
      },
      { status: 503 },
    );
  const model = (input.model || env.AI_MODEL || config.model).slice(0, 100);
  const prompt = buildPrompt(input);
  if (!prompt)
    return Response.json({ error: "无效的 AI 操作" }, { status: 400 });

  try {
    const upstream = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": new URL(request.url).origin, "X-Title": "念生" }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: prompt,
        temperature: input.action === "relations" ? 0.25 : 0.6,
        max_tokens: input.action === "relations" ? 1800 : 1200,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!upstream.ok)
      return Response.json(
        {
          error: "UPSTREAM",
          message: data.error?.message || "模型服务返回错误",
        },
        { status: 502 },
      );
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content)
      return Response.json(
        { error: "EMPTY", message: "模型没有返回内容" },
        { status: 502 },
      );
    if (input.action === "chat")
      return Response.json({ mode: "model", provider, model, reply: content });
    const parsed = parseJson(content);
    return Response.json({ mode: "model", provider, model, result: parsed });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "模型响应超时，请稍后重试。"
        : "暂时无法连接模型服务。";
    return Response.json({ error: "CONNECT", message }, { status: 502 });
  }
}

function buildPrompt(input: AiRequest) {
  if (input.action === "analyze") {
    const content = typeof input.idea?.content === 'string' ? input.idea.content.slice(0,6000) : '';
    if (!content) return null;
    return [
      {
        role: "system",
        content:
          "你是个人想法的思考伙伴，帮助创作、学习和生活目标变成一个具体下一步。先理解意图，不默认采用商业需求验证或用户访谈。只返回有效 JSON，不要代码围栏。字段：title,summary,tags(字符串数组),feasibility,impact,clarity,confidence(均为0-100整数，仅作粗略建议，不代表客观成熟度),risk,nextAction。区分已知事实与待确认判断，不编造证据。",
      },
      { role: "user", content: `分析这个想法：\n${content}` },
    ];
  }
  if (input.action === "chat") {
    const idea = input.idea;
    if (!idea || typeof idea.content !== 'string' || typeof idea.title !== 'string' || typeof input.question !== 'string' || !input.question.trim()) return null;
    return [
      {
        role: "system",
        content:
          "你是个人用户的思考伙伴，服务创作、学习与生活目标。先理解用户意图，再按请求澄清、给出下一步或挑战假设。不要默认建议商业验证或访谈，不把所有想法都当创业项目。用中文简洁回答，引用已有信息，区分事实、建议和未知；不要编造证据。下一步必须小而具体，并有完成标准。",
      },
      {
        role: "user",
        content: `想法：${idea.title}\n方向：${idea.intent || '探索'}\n描述：${idea.content}\n已有风险：${idea.risk || "未知"}`,
      },
      ...(Array.isArray(input.messages) ? input.messages.filter(message=>message && ['user','assistant'].includes(message.role) && typeof message.content === 'string').slice(-8).map(message=>({...message,content:message.content.slice(0,3000)})) : []),
      { role: "user", content: input.question.slice(0, 3000) },
    ];
  }
  if (input.action === "relations") {
    const ideas = (input.ideas || [])
      .slice(0, 40)
      .map((idea) => ({
        id: idea.id,
        title: idea.title.slice(0, 120),
        content: idea.content.slice(0, 600),
        tags: idea.tags || [],
      }));
    if (ideas.length < 2) return null;
    return [
      {
        role: "system",
        content:
          '你是想法知识图谱分析器。分析想法间的语义与逻辑关系。只返回有效 JSON，不要代码围栏。格式：{"edges":[{"sourceId":"","targetId":"","type":"相似|依赖|先后|包含|互补|冲突|资源复用","reason":"20字内中文原因","strength":0到1}]}。只保留有意义的关系，每个想法最多3条边，禁止虚构不存在的ID。',
      },
      { role: "user", content: JSON.stringify(ideas) },
    ];
  }
  return null;
}

function parseJson(content: string): unknown {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = Math.min(
      ...["{", "["].map((char) => {
        const index = cleaned.indexOf(char);
        return index < 0 ? Infinity : index;
      }),
    );
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start)
      return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("模型返回的 JSON 无法解析");
  }
}
