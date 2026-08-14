# Agent Builder 图形化设计稿（Web 端组合）

> 现状：CLI 已实现 `agenthub compose`（bundles/presets/skills/权限并集 + 冲突报错，e2e-compose 13/13）。
> 本文定义 Web 图形化组合的产品与实现方案；未排期，属规划态。

## 1. 产品形态

首页顶栏入口 **「组合 Agent」** → 进入 Builder 页：

```
┌───────────────────────────────────────────────┐
│ 组合新 Agent                                  │
│                                               │
│ 名称: [我的投资研究 Agent________]              │
│                                               │
│ 领域模块（可多选）：                           │
│  ☑ Finance Analyst      (bundle+preset+4 skills)│
│  ☐ Academic Researcher  (bundle+preset+2 skills)│
│  ☐ 社区插件 demo-tool   (仅 bundle，需信任确认) │
│                                               │
│ 冲突预览: [无]                                 │
│ 权限并集: 网络 localhost:3111,3112             │
│                                               │
│ [生成 Bundle] → 下载 agenthub 安装包 / 直接装  │
└───────────────────────────────────────────────┘
```

- 选中即合并（bundles/presets/skills/权限并集），实时显示冲突（同名 preset / 同名 bundle 不同源 / 信任等级低于 community 的模块默认不可选）。
- 生成结果 = 一个标准 Agent Bundle（agenthub.yaml 全套目录），可下载、可发布、可一条命令安装——与 CLI compose 输出格式一致。

## 2. 服务端实现方案

组合所需的源 Agent 元数据（manifest + 制品）Registry 已全部持有，服务端即可生成组合包：

- `POST /v1/compose {name, category, publisher, ids: [...]}` → 服务端从 db.agents 取各源 manifest 与制品 → 复用 lib/scaffold.composeAgent 的合并逻辑（从制品目录而非本地目录读取）→ 打包返回 tgz。
- 组合包的 publisher = 请求方发布者（走既有发布鉴权）；组合包含多来源内容，trust 定级 = 各来源最低 trust。
- 若某来源为 blocked → 组合请求直接拒绝（继承安全性）。

## 3. 与 CLI 的关系

- CLI compose（本地目录源）与服务端 compose（Registry 源）共用合并核心（lib/scaffold 已按此结构实现）。
- Web 端组合包下载后同样走 `agenthub install` 完整安全链（验签→扫描→信任门禁）。

## 4. 里程碑建议

1. 服务端 /v1/compose 端点 + 单元级合并测试（复用 composeAgent）。
2. Builder 页面（服务端渲染：模块卡片 + 勾选 + 冲突预览 + 生成按钮）。
3. 组合包一键发布（生成后直接进入发布审核队列）。
