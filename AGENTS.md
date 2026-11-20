# 念生开发约定

- 面向所有个人用户，覆盖创作、学习、生活目标。优先验收 Windows 与 Android。
- `app/dashboard-client.tsx` 与 `features/workspace` 是所有模式的主实现。`standalone` 通过相同组件生成 GitHub Pages 与离线界面，不再维护 `docs/app.js` 的业务功能。
- `lib/workspace.ts` 定义领域规则、备份格式和统计口径；游客与账户模式共享这些规则。
- 保存先持久化本地操作，云端成功后才显示已同步。失败保留草稿与待同步操作，冲突保留副本。不得自动上传游客记录。
- 示例只能通过显式入口进入，不参与个人统计、同步与导出。
- AI 可选，调用失败明确说明；Key 默认仅内存，不能进入备份与日志。不得以关键词分数冒充成熟度或真实模型输出。
- 想法结束与行动完成分别处理。归档可恢复，不新增直接永久删除入口。
- 核心检查：`npm test`、`npx tsc --noEmit`、`npm run build:local`、`npm run build`。修改状态/同步/迁移时添加有意义的回归检查；UI 修改在桌面和 390px 视口实际验收。
- 数据库变更追加 Drizzle migration，不改已应用的迁移。保留现有用户数据和未提交改动。
- 版本完成依据记录在 `PRODUCT.md`、`DESIGN.md`、`RELEASE-CHECKLIST.md`；计划、已实现与未实测必须区分。
