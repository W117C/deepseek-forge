# DeepSeek Forge v0.2.0

AgentHub / DeepSeek Forge —— DeepSeek Harness Agent Bundle Marketplace。

## 线上站点

| 站点 | 地址 |
| --- | --- |
| 🛍️ Marketplace | https://deepseek-forge-marketplace.vercel.app |
| 🌐 落地页 | https://deepseek-forge.vercel.app |

## 本版新增

- **全新 Marketplace 前端**（`forge/`）：React 18 + TS + Vite + React Router
  - 路由：首页 / explore / search / agents / bundles / plugins / skills / 详情 / publish
  - 交互：⌘K 命令面板、安装弹窗（终端模拟）、URL 同步筛选、深/浅色模式、骨架屏/404/空态
  - 懒加载分包 + 自托管字体，SPA 深链直开（Vercel rewrites）
- **落地页接入 Marketplace**：Header 导航 + Hero 主 CTA 直达市场
- **部署体系**：两个 Vercel 项目 Git 集成自动部署（推送 main 即上线）；废弃旧只读静态页（`web/` 移除、旧项目删除）

## 工程整理

- **CI**：e2e 全量 14 套 203 项 + landing/forge 双构建（typecheck + 生产构建）
- **打包**：package.json 可发布化（files/repository/keywords/engines）、MIT LICENSE、[npm 发布 runbook](https://github.com/W117C/deepseek-forge/blob/main/docs/npm-publish-runbook.md)
- **修复**：installer 在 CI 下 pnpm frozen-lockfile 导致多 bundle/升级安装失败（v0.1.x 遗留，203/203 全绿）；package.json JSON 转义
- **文档**：README 重构、docs/deployment.md 增加线上拓扑

## 仓库

- https://github.com/W117C/deepseek-forge （历史更名：W117C/agenthub → W117C/deepseek-agenthub → 现名，GitHub 自动重定向）

## 快速开始

```sh
git clone https://github.com/W117C/deepseek-forge
cd deepseek-forge
node cli/agenthub.mjs install ./bundles/finance-analyst --yes
dsh --profile finance   # 现在它是一个 Finance Agent
```
