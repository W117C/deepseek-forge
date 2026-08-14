# @deepseek-forge/bin

DeepSeek Forge 的预构建 forge-core Rust 二进制（可选依赖包）。

- 产物来源：仓库 CI 的 `binaries` job（三平台 cargo build --release + upload-artifact）。
- 打包：从 CI 下载三个 artifact（forge-core-linux / forge-core-darwin / forge-core-windows），
  运行 `bash pack.sh <下载目录>`，然后 `npm publish`。
- 运行时解析：lib/forge-core-bin.mjs 按
  FORGE_CORE_BIN → 仓库内 target（开发）→ node_modules/@deepseek-forge/bin/<platform>/ → PATH 顺序解析。
- 说明：本包当前为骨架（尚无二进制随包发布）；正式发布需在 CI artifact 下载后执行 pack.sh。
