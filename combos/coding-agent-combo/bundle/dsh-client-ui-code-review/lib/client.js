/**
 * @agenthub/dsh-client-ui-code-review —— 编码 Agent diff/工作区看板（浏览器半部）。
 * 经 window.__ModuleLoader__.load 注册，挂载为 DSH Web 的面板。
 * 看板三块：Diff 统计（变更文件数/增删行）、变更文件列表、Worktree 状态。
 * 数据来自会话 git 工具输出（会话工具侧把结果写入看板 store）；最小可用版展示
 * 骨架与"运行 git 后自动填充"的说明，真实数据由 coding 会话的 git 工具提供。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-code-review",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");

    /** Diff 统计卡片：变更文件数 / 增 / 删（占位，会话 git 工具写入后更新）。 */
    function DiffStats() {
      var stats = [
        { label: "变更文件", value: "—" },
        { label: "新增 +", value: "—" },
        { label: "删除 −", value: "—" },
      ];
      return jsxRuntime.jsx("div", {
        style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
        children: stats.map(function (s) {
          return jsxRuntime.jsxs("div", {
            style: { border: "1px solid var(--border, #2a2d33)", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
            children: [
              jsxRuntime.jsx("div", { style: { fontSize: 16, fontWeight: 700, color: "var(--accent, #58a6ff)" }, children: s.value }),
              jsxRuntime.jsx("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" }, children: s.label }),
            ],
          });
        }),
      });
    }

    /** 变更文件列表（占位；git diff --name-only 结果写入后渲染）。 */
    function ChangedFiles() {
      var files = [];
      return jsxRuntime.jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsxRuntime.jsx("div", { style: { fontSize: 12, fontWeight: 600 }, children: "变更文件" }),
          files.length === 0
            ? jsxRuntime.jsx("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" }, children: "（在会话中运行 git diff 后显示）" })
            : files.map(function (f, i) {
                return jsxRuntime.jsx("div", { style: { fontSize: 12, fontFamily: "var(--font-mono, monospace)" }, children: f }, i);
              }),
        ],
      });
    }

    /** Worktree 状态（占位；git status --short 结果写入后渲染）。 */
    function Worktree() {
      return jsxRuntime.jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsxRuntime.jsx("div", { style: { fontSize: 12, fontWeight: 600 }, children: "Worktree" }),
          jsxRuntime.jsx("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" }, children: "（git status --short 结果写入后显示分支与状态）" }),
        ],
      });
    }

    /** 面板主体：编码 Agent 看板（diff 统计 + 变更文件 + worktree）。 */
    function CodeReviewPanel() {
      return jsxRuntime.jsxs("div", {
        style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 },
        children: [
          jsxRuntime.jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: "编码工作区看板" }),
          jsxRuntime.jsx(DiffStats, {}),
          jsxRuntime.jsx(ChangedFiles, {}),
          jsxRuntime.jsx(Worktree, {}),
        ],
      });
    }

    exports.CodeReviewPanel = CodeReviewPanel;
    exports.default = CodeReviewPanel;
    module.exports = exports;
    return module.exports;
  },
});
