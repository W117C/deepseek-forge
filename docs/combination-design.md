# 高质量组合包设计方案（2026-08-15）

> 目标：组合必须**真实、有效、有用**——以 GitHub stars 为质量信号，把社区热门插件与
> 非 DSH 专用开源 skill 适配成 DeepSeek Harness 形态，产出「高星、高效、真能用」的领域组合包。

## 1. 质量信号：GitHub stars

- 质量信号 = 包 `extra.stars`（真实 GitHub star 数，由 CI curate workflow 用 GITHUB_TOKEN 探测补全）。
- 精选阈值：**stars ≥ 500** 才进入组合候选（低于阈值的插件质量不可信，不作为组合卖点）。
- 组合内组件排序按 stars 降序（高星优先占槽位）。
- 诚实原则：无 stars 数据（探测失败）的包**不进入**组合（宁缺毋滥），槽位留空并在组合说明中明示。

## 2. 领域组合模板（复用/扩展 recipes.ts 的 11 个领域）

每个组合 = `{领域 id, 领域名, 槽位定义[]}`，槽位按领域角色（搜索/浏览器/论文/数据/文档）指向
curated-registry 中**真实存在的包 id**，首个可用的高星包胜出。已有模板：
`deep-research` / `coding-agent` / `data-analyst` / `investment-research` / `academic-agent`
/ `github-analyzer` / `browser-research` / `ecommerce-research` 等（48 槽位，11 空槽）。

## 3. 非 DSH 开源 skill 适配流程（SKILL.md 转换）

DSH skill 的 frontmatter 仅要求：`name`（kebab-case，必填）+ `description`（必填），
可选 `whenToUse` / `disable-model-invocation` / `user-invocable`（官方 skill 机制，与
Anthropic/awesome-claude-skills 的 SKILL.md 格式**天然兼容**）。适配步骤：

1. **拉取**：从 GitHub 仓库（Anthropic 官方 skills / awesome-skills 列表 / 任意开源 SKILL.md）
   下载 `SKILL.md` 及技能目录。
2. **校验**：frontmatter 必须有 `name`（转 kebab-case，非法字符清洗）与 `description`；
   缺失 description 时用仓库 README 首段补全；缺 name 时用目录名 slug。
3. **包装**：写入组合包 `skills/<name>/SKILL.md`（标准 DSH 落盘路径），
   与插件 bundle 一起被 preset 发现、被 agent 自动加载。
4. **验证**：组合安装后 health 的 preset-skills 检查确认 SKILL.md 已落盘。

## 4. 组合包生成（真实可安装产物）

生成器输出与 createAgent/composeAgent 同构的标准 Agent Bundle：

```
组合目录/
├── agenthub.yaml          # id/name/category/preset/skills/profile/health（十步管线可装）
├── preset/<id>/           # 基于 standard，persona = 领域专业身份 + 槽位能力说明
│   ├── agent.cordis.yml
│   └── preset.yml
├── skills/<name>/SKILL.md # 适配后的开源 skill（多个）
├── profile.patch.yml
└── bundle/<pkg>/          # 插件 bundle 实体（来自 curated 包的 GitHub 源或本地）
```

## 5. 有效性门槛（必须满足）

1. `agenthub install <组合目录>` 走完整十步管线（compatibility→安全扫描→快照→…→健康检查）。
2. 健康检查 PASS：dump-config 组合树可解析 + preset-skills 检查确认 preset/skill 落盘。
3. 组合内每个组件均在 curated-registry 中真实存在（无悬空引用）。
4. 失败即回滚，绝不产出「假组合」。
