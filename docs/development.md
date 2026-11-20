# 开发与接口说明

[返回产品使用说明](../README.md)

## 本地开发

```bash
npm install
npm run dev
```

Web、GitHub Pages 以及在线站点的离线壳共用 React 界面与领域规则。修改后通过以下命令检查并生成产物。

```bash
npm test
npx tsc --noEmit
npm run build:local
npm run build
npm start
```

`npm run build:local` 生成 `docs/` 下的 GitHub Pages 静态产物，以及 `public/local/` 下的在线离线壳。GitHub Pages 从 `main` 分支的 `/docs` 发布。`npm start` 运行本地 Cloudflare Worker，使用本机 D1。API 集成测试需要将 `NIANSHENG_TEST_URL` 设为本地 Worker 地址，再运行 `npm test`。

数据库变更追加 Drizzle 迁移。首次本地初始化按编号应用 `drizzle/` 下的迁移，之后仅应用新迁移。在线站点部署通过 Sites 管理，Cloudflare 公共入口转发到同一个源站与 D1。

## 大模型接口

`POST /api/ai` 需要登录，支持 `analyze`、`chat` 和 `relations`。当前界面主要通过「思考伙伴」使用 `chat`，通过关系图谱使用 `relations`。支持 OpenAI、DeepSeek 和 OpenRouter。服务端默认模型可通过 `AI_API_KEY`、`AI_PROVIDER` 与 `AI_MODEL` 配置，后端只允许预设的 HTTPS 服务地址。

邮箱密码账户、可用的第三方登录和已有订阅管理配置见 [环境变量示例](../.env.example)。部署当前采用免费试用，默认关闭新购买。
