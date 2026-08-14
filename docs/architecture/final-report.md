# DeepSeek Forge Desktop 迁移 —— 最终报告（v0.4 Phase 0-8）

> 基线：v0.3.0 REAL Marketplace（HTTP Registry + SQLite + Node 单核心）。
> 结论：Desktop-first 增量迁移完成核心链路：**GitHub → Analyze → Adapter → Package → Install → Run** 的 Forge 侧能力全部落地，Desktop 壳可构建可运行，CLI 与 Desktop 共用同一 Rust Kernel。

## 1. Executive Summary

在不重写、不删除、不降低测试标准的前提下，把 DeepSeek Forge 从“Web 市场 + Node 单核心”演进为“Tauri 2 桌面 + Rust Forge Kernel + Node 薄壳”：

- **Forge Kernel（Rust）**：Package 模型/Manifest/Registry/安装引擎/签名/安全扫描/快照回滚/导入分析/Adapter/Composer/Runtime —— 全部在 crates/forge-core，47 项 cargo 测试。
- **CLI 与 Desktop 单一实现**：lib/installer/signing/security 三模块 API 不变、内部委托 Rust 引擎；18 套 e2e 断言一行未改，现驱动 Rust 引擎全绿；parity 套件 33/33 逐项证明新旧行为一致。
- **安全不变**：SHA256 + Ed25519 + 静态扫描 + 信任门禁 + 快照/自动回滚；新增伪签名/篡改制品/无许可证三阻断路径（实测）。
- **诚实原则**：无 mock 冒充、无假数据（空态=空态）、无 fake AI（规则型生成器明示）。

## 2. Architecture Before → After

Before：cli/agenthub.mjs + lib/*.mjs（Node，安装/签名/安全全在此）+ forge/ Web 市场 + HTTP Registry 服务器（SQLite）。
After：desktop/（Tauri 2 壳，typed IPC）→ crates/forge-core（Rust Kernel：model/manifest/registry/signing/security/installer/snapshot/import/adapter/composer/runtime/errors/events）→ Local Registry（~/.deepseek-forge/registry，目录式）；cli/ 变薄壳经 lib 委托桥调用同一 Kernel；HTTP Registry 保留为兼容后端。

## 3. 交付物与验证（命令 → 结果 → exit code）

- cargo：`cargo fmt --all -- --check` ✅；`cargo test` 47/47 ✅；`cargo build --release` ✅。
- e2e：`for t in test/e2e*.mjs; do node "$t" || exit 1; done` → 19 套（18 原套件 + parity）ALL PASS（本报告生成时最终全量门禁 bash-49）。
- 构建：forge/landing/desktop `npm run build` exit 0；desktop/src-tauri `cargo build` exit 0；`tauri build --debug --no-bundle` exit 0；桌面二进制 10 秒启动冒烟存活。
- 真机冒烟：Rust 引擎安装 finance-analyst（health PASS、dump-config 含 mcp-market-data/schedule）；签名路径验签通过；伪签名 PUBLISHER_UNTRUSTED 阻断；篡改制品 HASH_MISMATCH 阻断；import analyze 三类 fixture 正确分类；runtime status 实测 harness 0.1.0-rc.6 + 7 进程。
- 扫描：secrets/mock 扫描零命中；生产 mock 依赖零。

## 4. 各阶段 commit

3a74750(docs) → 977cec6(core) → 6f07733(desktop shell) → efe9d67(installer+parity 桥) → 52477dd+e6c11fe(import) → e37f431(adapter) → 4380cc1(composer) → 80a34bd(runtime) → 本阶段(polish)。v0.3.0 已 tag；全部 commit 未 push。

## 5. Security / Trust Model

保留并强化：SHA256+Ed25519（Node↔Rust 金向量逐字节一致 + 双向交叉验证）、7 规则静态扫描（回环豁免/canonical 白名单）、trust 门禁、blocked/yanked 阻断、token 哈希、audit；新增：无许可证仓库导入/适配拒绝（SECURITY_BLOCKED）、危险命令/secret 检测进分析面、能力声明（network.http/filesystem.write/environment.read/shell.execute）与高风险人工确认门禁。

## 6. Known Issues（诚实清单）

见 migration-plan.md §14：Composer 图形 UI、Runtime 进程控制、日志聚合、Git Registry 网络接入、更新检查、AI Adapter 提案、D1 npm 二进制分发、官方 bundle 根 LICENSE 文件，均为后续增量。

## 7. 复现

```
git log --oneline   # 8 个阶段 commit
cd crates/forge-core && cargo test && cargo build --release
for t in test/e2e*.mjs; do node "$t" || exit 1; done
cd desktop && npm install && npm run build && npm run tauri build -- --debug --no-bundle
```
