# 专业 Agent 组件体系设计（2026-08-15）

> 目标：让「一键组装的专业 Agent」不仅带 persona + skills，还带**专属 UI 面板**——
> 金融分析 Agent 在 DSH Web 显示数据看板，编码 Agent 显示 diff / 文件看板 / worktree。
> 全部复用 DSH 官方机制（bundle + cordis patch + dsh.client roster），不 fork 不改源码。

## 1. 结论：DSH Web UI 面板扩展机制（源码级核实）

- **挂载点**：`dsh-web-app` 的 `cordis.patch.yml` 在 `- insert:` 段按行挂载浏览器面板包。
  示例（官方结构，逐行核实）：

  ```yaml
  - insert:
      - id: ui-workspace
        name: '@deepseek-ai/dsh-client-ui-workspace'
  ```

- **面板包结构**（标准 npm 包，`package.json` 内声明）：

  ```jsonc
  {
    "name": "@xxx/dsh-client-ui-xxx",
    "dsh": {
      "client": {
        "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-runtime", "…"],
        "platform": "web"
      }
    },
    "exports": { ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
                 "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" } }
  }
  ```

- **含义**：第三方 UI 面板 = 一个 `@xxx/dsh-client-ui-*` npm 包 + 在自己 bundle 的
  `cordis.patch.yml` 里 insert 一行。这正好落在我们 bundles 层——**bundle 不再只是
  宿主能力，还能携带浏览器面板**。

## 2. 专业 Agent 组件体系（四件套）

```
专业 Agent（可一键组装 / 一键卸载）
├── persona      preset/agent.cordis.yml（领域人设）
├── skills       preset/skills/<name>/SKILL.md（真实开源 skill，已落地）
├── bundles      宿主能力（MCP / schedule / 数据源 provider）
└── UI 面板      bundle/<pkg>/cordis.patch.yml insert `dsh-client-ui-*` 行（新增）
```

- **一键组装**：组合包生成器 / wrap / compose 已支持四件套全部引用（UI 面板是 bundle 的一部分）。
- **一键卸载**：`restore_snapshot` 已恢复 profile/preset/skills/bundles——UI 面板随 bundle
  pnpm 卸载自动移除（patch 行随 profile patch 快照恢复）。

## 3. 样板面板规划

| 面板 | 专业 Agent | 内容 | 状态 |
|---|---|---|---|
| `dsh-client-ui-market-data` 市场数据看板 | finance-analyst | 行情卡片、数据源状态、定时简报入口 | 首个样板（任务 #4） |
| `dsh-client-ui-code-review` diff/文件看板 | coding-agent | diff 统计、变更文件列表、worktree 视图 | 规划 |
| `dsh-client-ui-research` 论文看板 | academic-researcher | 文献追踪、引用核验入口 | 规划 |

## 4. 实现路径（样板：金融看板）

1. 新建 `bundles/finance-analyst/bundle/client-ui-market-data/`：
   - `package.json`：`name: @agenthub/dsh-client-ui-market-data`，`dsh.client` 声明 + exports。
   - `src/client.js` / `lib/client.js`：面板客户端入口（最小可用：数据源状态 + 行情占位卡，
     对齐官方 client-ui 的导出形态）。
2. `finance-core/cordis.patch.yml` 增加：

   ```yaml
   - id: ui-market-data
     name: '@agenthub/dsh-client-ui-market-data'
   ```

   `finance-core/package.json` dependencies 增加 `@agenthub/dsh-client-ui-market-data`。
3. 安装 finance-analyst → pnpm 会把面板包装入 profile node_modules → DSH Web 扫描
   `dsh.client` roster 时发现并挂载面板。
4. 卸载 finance-analyst → 快照恢复 + pnpm 移除面板包，UI 面板随之消失。

## 5. 验证门槛

- 安装 finance-analyst 后：`dump-config` 组合树含 `ui-market-data` 行（现有 health 机制即可查）。
- `dsh --profile finance` 启动 Web 后，浏览器面板出现（人工确认；自动化待 UI e2e）。
- 卸载后 dump-config 不再含该行。
