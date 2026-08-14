# npm 发布 Runbook（agenthub CLI）

> 状态：待发布。npm 包名 `agenthub` 可用（已核查，无占用）。
> 前置：npm 账号 + granular token（只授 agenthub 包 publish 权限）。

## 发布前检查

- [ ] `node --version` ≥ 22（engines 声明）
- [ ] CI 全绿（GitHub Actions：e2e 203 项 + landing/forge 构建）
- [ ] 版本号：`package.json` version 与本次 tag（如 v0.2.0）一致
- [ ] LICENSE 版权署名确认（当前 MIT / AgentHub contributors）
- [ ] 打包内容自检：`npm pack --dry-run`，确认只含 cli/ lib/ bundles/ README/LICENSE

## 发布步骤

```sh
# 1. 设置 token（granular token 只授 agenthub 包 publish）
npm config set //registry.npmjs.org/:_authToken <NPM_TOKEN>

# 2. 干跑自检
npm pack --dry-run

# 3. 发布
npm publish --access public

# 4. 验证
npm view agenthub version
npx agenthub --help
```

## 后续（可选）自动化

GitHub Actions 发布工作流：tag v* 推送 → `npm publish`（`NPM_TOKEN` 存为 Actions secret）。
需要时把 secret 配好即可接入（workflow 模板见 `.github/workflows/` 后续添加）。

## 注意

- 发布后 CLI 即可 `npm i -g agenthub` 全局安装；
- 未发 npm 期间，GitHub Release 的源码 tarball 仍是可用分发方式。
