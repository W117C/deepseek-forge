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

## D1：forge-core 预构建二进制分发（v0.4 Desktop 起）

CLI 的安装/签名/安全经 lib 委托桥调用 forge-core Rust 二进制；npm 包需要按平台分发：

1. CI 已提供三平台构建矩阵（.github/workflows/ci.yml 的 binaries job：linux x86_64 / darwin aarch64 / windows x86_64），产物 upload-artifact。
2. 发布时从 CI 下载三平台产物，打包为可选依赖包 @deepseek-forge/bin（目录结构 node_modules/@deepseek-forge/bin/<platform>/forge-core[.exe]）。
3. lib/forge-core-bin.mjs 的解析优先级：FORGE_CORE_BIN → 仓库内 release/debug（开发）→ node_modules/@deepseek-forge/bin/<platform>/（发布）→ PATH。
4. 当前仓库开发/CI 流程不受影响（e2e job 已前置 cargo build --release）。

补充：@deepseek-forge/bin 骨架已就绪（packages/forge-bin/）。发布步骤：
1. CI 下载三平台 artifact → bash packages/forge-bin/pack.sh <dir>
2. cd packages/forge-bin && npm publish
3. 根包 package.json 增加 optionalDependencies: { "@deepseek-forge/bin": "0.4.0" }（发布版）
