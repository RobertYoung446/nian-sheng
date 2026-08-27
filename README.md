# 念生

让值得实现的想法，真正发生。念生提供灵感记录、模型分析、关系图谱、行动推进和周期复盘的一体化工作流。

## 真实大模型接口

站点提供受身份保护的 `POST /api/ai` 接口，支持三种操作：

- `analyze`：结构化评估单个想法并返回评分、风险和下一步行动。
- `chat`：围绕想法进行建设性反方讨论。
- `relations`：分析多个想法间的相似、依赖、先后、包含、互补、冲突和资源复用关系。

接口支持 OpenAI、DeepSeek 和 OpenRouter。用户可以在页面右上角的“AI 接口”面板输入临时密钥；密钥只存在当前页面内存中，并通过同源后端转发。站点管理员也可以配置以下服务器环境变量：

```env
AI_API_KEY=
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
```

为避免 SSRF，后端只允许代码中列出的官方 HTTPS 服务地址，不接受客户端自定义 Base URL。

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```
