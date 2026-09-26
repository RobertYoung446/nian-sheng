# 开发与接口说明

[返回产品使用说明](../README.md)

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 大模型接口

站点提供受身份保护的 `POST /api/ai` 接口，支持三种操作：

- `analyze`：结构化评估单个想法并返回评分、风险和下一步行动。
- `chat`：围绕想法进行建设性反方讨论。
- `relations`：分析多个想法间的相似、依赖、先后、包含、互补、冲突和资源复用关系。

接口支持 OpenAI、DeepSeek 和 OpenRouter。用户可在「AI 接口」面板配置自己的模型连接，通过同源后端转发。站点管理员也可以配置以下服务器环境变量：

```env
AI_API_KEY=
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
```

为避免 SSRF，后端只允许代码中列出的官方 HTTPS 服务地址，不接受客户端自定义 Base URL。

公开独立版位于 `docs/`，数据保存在浏览器中，与正式版的账户数据分开。
