# DeepSeek Forge v0.3.0

代号：REAL MARKETPLACE —— 从 MVP / 验证型 Agent Marketplace 升级为 Real Agent Marketplace Infrastructure。

## 本版主题：消除 mock，打通真实闭环

```
Developer → forge publish（本地签名）→ Registry（验签+扫描+哈希+审核）
         → Marketplace（真实 API，零 mock）→ forge install（验签→快照→安装→健康检查）
         → DeepSeek Harness
```

## Phase A — SQLite 数据层
- node:sqlite 存储（schema_version 迁移框架 + 事务 + WAL + 崩溃恢复），v0.3 规范十表齐备
- 旧 registry.json 一次性迁移（.migrated 保留回滚）；发布者令牌哈希落库；审计日志；备份前 WAL checkpoint

## Phase B — 模型层
- SemVer 校验/排序；统一包状态机；/v1/packages 泛化端点（旧 /v1/agents 并存）；Publisher 模型；dependencies 表落行

## Phase C — Marketplace 前端接通
- forge/src/api 13 模块客户端层；mock.ts 删除（全仓零引用）；CORS；Publish 重写为 CLI 发布向导（浏览器只传公钥）；安装上报幂等

## Phase D — 收尾
- forge bin 别名；包状态管理端点（yank/deprecate）；客户端 yanked 门禁；发布者令牌轮换

## 验证
- 18 套 e2e / 245 项全绿；forge typecheck + 生产构建；landing 构建

## 部署（上线清单）
- Vercel 配置 VITE_REGISTRY_URL 指向公网 Registry；Registry 主机按 docs/deployment.md（HTTPS + 鉴权开关 + 备份演练）
