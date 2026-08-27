import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

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
  const input = (await request.json()) as AiRequest;
  const requestedProvider =
    input.provider || (env.AI_PROVIDER as Provider) || "openai";
  const provider =
    requestedProvider in providers ? requestedProvider : "openai";
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
    const content = input.idea?.content?.slice(0, 6000);
    if (!content) return null;
    return [
      {
        role: "system",
        content:
          "你是严格、务实的创新项目评审。不要迎合。只返回有效 JSON，不要代码围栏。字段必须是：title,summary,tags(字符串数组),feasibility,impact,clarity,confidence(均为0-100整数),risk,nextAction。结论必须具体、可验证。",
      },
      { role: "user", content: `分析这个想法：\n${content}` },
    ];
  }
  if (input.action === "chat") {
    const idea = input.idea;
    if (!idea || !input.question?.trim()) return null;
    return [
      {
        role: "system",
        content:
          "你是用户的思想伙伴和建设性反方。围绕想法寻找隐含假设、反例和最低成本验证方式。用中文简洁回答，不迎合，不空泛，优先引用用户给出的具体信息。",
      },
      {
        role: "user",
        content: `想法：${idea.title}\n描述：${idea.content}\n已有风险：${idea.risk || "未知"}`,
      },
      ...(input.messages || []).slice(-8),
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
